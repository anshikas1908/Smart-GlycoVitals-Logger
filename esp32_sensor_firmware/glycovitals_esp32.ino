/*
 * GlycoVitals ESP32 Firmware
 * Hardware: ESP32 + DS18B20 (Temperature) + MAX30102 (HR/SpO2)
 * 
 * Libraries needed (Install via Arduino Library Manager): 
 * - Firebase ESP32 Client (by Mobizt)
 * - DallasTemperature (by Miles Burton)
 * - OneWire (by Paul Stoffregen)
 * - SparkFun MAX3010x Pulse and Proximity Sensor Library
 */

#include <WiFi.h>
#include <FirebaseESP32.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "MAX30105.h"
#include "heartRate.h"

// --- CONFIGURATION ---
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define FIREBASE_HOST "smart-glycovitals-logger-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH "AIzaSyAOxG79nNyl-Smffxut2UgSXWped9rCJMw" // Use your Database Secret or API Key

// Option A: Hardcoded Patient ID
#define PATIENT_ID "U001"

// --- PINS ---
#define ONE_WIRE_BUS 4 // DS18B20 data pin connected to GPIO 4

// --- SENSORS ---
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
MAX30105 particleSensor;

FirebaseData firebaseData;
FirebaseConfig config;
FirebaseAuth auth;

// BPM Logic
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute;
int beatAvg = 0;

// Timing
unsigned long lastUploadTime = 0;
const unsigned long uploadInterval = 5000; // 5 seconds

void setup() {
  Serial.begin(115200);
  Serial.println("GlycoVitals ESP32 Initializing...");
  
  // Initialize DS18B20
  sensors.begin();
  
  // Initialize MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 was not found. Please check wiring/power.");
    while (1);
  }
  
  particleSensor.setup(); 
  particleSensor.setPulseAmplitudeRed(0x0A); // Low power/brightness for demo
  particleSensor.setPulseAmplitudeGreen(0); 

  // WiFi Connect
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nConnected!");

  // Firebase Setup
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  // 1. Read Heart Rate (MAX30102) - Run this as often as possible
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
      Serial.println("Error: DS18B20 disconnected");
      tempC = 0.0;
    }

    // Read SpO2 (Simple estimation or logic from SparkFun library)
    // Note: For high-accuracy SpO2, more complex algorithm is needed.
    // For this project, we'll send the latest values.
    float spo2 = 98.0; // Placeholder for now or logic to read Red/IR
    if (irValue < 5000) spo2 = 0; // No finger detected

    Serial.print("Avg BPM: "); Serial.print(beatAvg);
    Serial.print(" | Temp: "); Serial.print(tempC);
    Serial.print(" | SpO2: "); Serial.println(spo2);

    // Create JSON Payload
    FirebaseJson json;
    json.set("heartRate", beatAvg > 0 ? beatAvg : 0);
    json.set("temperature", tempC);
    json.set("spo2", spo2);
    json.set("deviceOnline", true);
    
    // Set timestamp using Firebase server time
    json.set("timestamp/.sv", "timestamp");
    
    String path = "users/" + String(PATIENT_ID) + "/device/live";
    
    if (Firebase.setJSON(firebaseData, path, json)) {
      Serial.println("Firebase update successful");
    } else {
      Serial.println("Firebase update failed: " + firebaseData.errorReason());
    }
  }
}
