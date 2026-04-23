/*
 * GlycoVitals ESP32 Firmware
 * Hardware: ESP32 + DS18B20 (Temperature) + MAX30102 (HR/SpO2)
 * Libraries needed: 
 * - Firebase ESP32 Client (by Mobizt)
 * - DallasTemperature + OneWire (for DS18B20)
 * - SparkFun MAX3010x Pulse and Proximity Sensor Library
 */

#include <WiFi.h>
#include <FirebaseESP32.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "spo2_algorithm.h"

// --- CONFIGURATION ---
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define FIREBASE_HOST "smart-glycovitals-logger-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH "AIzaSyAOxG79nNyl-Smffxut2UgSXWped9rCJMw" // Use your Database Secret or API Key

#define PATIENT_ID "U001"

// --- PINS ---
#define ONE_WIRE_BUS 4 // DS18B20 data pin connected to GPIO 4

// --- SENSORS ---
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
MAX30105 particleSensor;

FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

// HR Logic
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute;
int beatAvg;

void setup() {
  Serial.begin(115200);
  
  // Initialize DS18B20
  sensors.begin();
  
  // Initialize MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("MAX30102 was not found. Please check wiring/power.");
    while (1);
  }
  
  particleSensor.setup(); 
  particleSensor.setPulseAmplitudeRed(0x0A); // Low power/brightness
  particleSensor.setPulseAmplitudeGreen(0); // Turn off green LED

  // WiFi Connect
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println();
  Serial.print("Connected with IP: ");
  Serial.println(WiFi.localIP());

  // Firebase Setup
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

unsigned long lastUploadTime = 0;
const unsigned long uploadInterval = 5000; // 5 seconds

void loop() {
  // 1. Read Heart Rate (MAX30102)
  long irValue = particleSensor.getIR();
  
  if (checkForBeat(irValue) == true) {
    long delta = millis() - lastBeat;
    lastBeat = millis();
    beatsPerMinute = 60 / (delta / 1000.0);

    if (beatsPerMinute < 255 && beatsPerMinute > 20) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;
      beatAvg = 0;
      for (byte x = 0 ; x < RATE_SIZE ; x++) beatAvg += rates[x];
      beatAvg /= RATE_SIZE;
    }
  }

  // 2. Periodic Upload to Firebase
  if (millis() - lastUploadTime > uploadInterval) {
    lastUploadTime = millis();
    
    // Read Temperature
    sensors.requestTemperatures();
    float tempC = sensors.getTempCByIndex(0);
    
    if (tempC == DEVICE_DISCONNECTED_C) {
      Serial.println("Error: Could not read temperature data");
      tempC = 0.0;
    }

    Serial.print("Avg BPM: ");
    Serial.print(beatAvg);
    Serial.print(" | Temp: ");
    Serial.println(tempC);

    // Create JSON Payload
    FirebaseJson json;
    json.set("heartRate", beatAvg > 0 ? beatAvg : 0);
    json.set("temperature", tempC);
    json.set("timestamp", (double)millis()); // We'll use a better timestamp strategy if needed, but for 'live' this works
    // In a real device, you'd want actual Unix time, but the React app is looking for 'live' status based on last update.
    // Let's use a server-relative timestamp if the library supports it, or just push a 'lastUpdate' trigger.
    // Actually, the web app's `DEVICE_ONLINE_THRESHOLD_MS` uses `Date.now()`.
    // So the ESP32 needs to send a timestamp that is roughly synchronized.
    // Better: Write a 'timestamp' field using Firebase.ServerValue.TIMESTAMP equivalent or just send a heart beat.
    
    // For simplicity, let's just make the ESP32 tell the server to put its own time.
    // But since we are using 'set', we can use .set(".sv", "timestamp") in some libs.
    // In Firebase-ESP32, we can do it like this:
    json.set("timestamp/internal", 0); // placeholder
    
    String path = "users/" + String(PATIENT_ID) + "/device/live";
    
    // We will just write the numbers. The timestamp we will actually handle 
    // by letting the React app know when it last received data. 
    // Wait, the React app logic is: `Date.now() - (data.timestamp ?? 0) < 30000`.
    // So we MUST send a valid Unix-like timestamp from the ESP32.
    // Let's use a simple approach: if the ESP32 hasn't synced time, it's hard.
    // Better idea: The React app will update its own 'current' view.
    
    // Actually, I'll update the ESP32 code to use NTP for time synchronization.
    
    if (Firebase.setJSON(firebaseData, path, json)) {
      Serial.println("Firebase Success");
    } else {
      Serial.println("Firebase Error: " + firebaseData.errorReason());
    }
    
    // Update the timestamp separately to use SERVER time (best way)
    Firebase.setTimestamp(firebaseData, path + "/timestamp");
  }
}
