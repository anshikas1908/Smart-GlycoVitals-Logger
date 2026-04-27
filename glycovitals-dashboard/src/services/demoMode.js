/**
 * demoMode.js
 * ───────────
 * ESP32 Demo Mode service for Smart GlycoVitals Logger.
 *
 * Simulates realistic sensor data streaming from an ESP32 device
 * by pushing readings to Firebase every 5 seconds with smooth,
 * drift-based value changes (no random jumps).
 *
 * Exports:
 *   startDemoMode(patientId)  – begin pushing simulated readings
 *   stopDemoMode()            – stop the loop
 *   isDemoActive()            – check current state
 *   subscribeDemoState(cb)    – subscribe to state + latest values
 *   clearBadReadings(patientId) – remove bad data from Firebase
 *   pushFreshReading(patientId) – push a single realistic starting reading
 */

import { ref, push, get, remove, set } from 'firebase/database';
import { db } from '../firebase';

// ── Internal state ──────────────────────────────────────────────────────────

let _intervalId = null;
let _active = false;
let _listeners = [];

// Track drifting values so each new reading is smooth
let _prevGlucose = 120;
let _prevHR = 76;
let _prevTemp = 36.6;

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function round1(val) {
  return Math.round(val * 10) / 10;
}

function notifyListeners() {
  const state = {
    active: _active,
    glucose: round1(_prevGlucose),
    heartRate: round1(_prevHR),
    temperature: round1(_prevTemp),
  };
  _listeners.forEach(cb => {
    try { cb(state); } catch { /* ignore */ }
  });
}

// ── Core: push one simulated reading ─────────────────────────────────────

async function pushSimulatedReading(patientId) {
  // Drift glucose: ±2 mg/dL per tick, clamped 108–135
  _prevGlucose = clamp(
    _prevGlucose + (Math.random() - 0.5) * 4,
    108, 135
  );

  // Drift heart rate: ±1 bpm per tick, clamped 72–84
  _prevHR = clamp(
    _prevHR + (Math.random() - 0.5) * 2,
    72, 84
  );

  // Drift temperature: ±0.05°C per tick, clamped 36.3–36.9
  _prevTemp = clamp(
    _prevTemp + (Math.random() - 0.5) * 0.1,
    36.3, 36.9
  );

  const ts = Date.now();
  const payload = {
    glucose:     round1(_prevGlucose),
    heartRate:   round1(_prevHR),
    temperature: round1(_prevTemp),
    timestamp:   ts,
    source:      'esp32_sensor',
    userId:      patientId,
  };

  try {
    const readingsRef = ref(db, `users/${patientId}/readings/${ts}`);
    await set(readingsRef, payload);

    // Also write to device/live so AddReadingModal sees "online"
    const deviceRef = ref(db, `users/${patientId}/device/live`);
    await set(deviceRef, {
      heartRate:   round1(_prevHR),
      temperature: round1(_prevTemp),
      timestamp:   ts,
    });
  } catch (err) {
    console.error('[DemoMode] Failed to push reading:', err);
  }

  notifyListeners();
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start the ESP32 demo mode loop.
 * Pushes a reading immediately, then every 5 seconds.
 */
export function startDemoMode(patientId) {
  if (_active) return; // already running

  _active = true;

  // Reset drift values to realistic starting points
  _prevGlucose = 118;
  _prevHR = 76;
  _prevTemp = 36.6;

  notifyListeners();

  // Push immediately, then every 5s
  pushSimulatedReading(patientId);
  _intervalId = setInterval(() => pushSimulatedReading(patientId), 5000);
}

/**
 * Stop the ESP32 demo mode loop.
 */
export function stopDemoMode(patientId) {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _active = false;
  notifyListeners();

  // Clear device/live so AddReadingModal reverts to "offline"
  if (patientId) {
    try {
      const deviceRef = ref(db, `users/${patientId}/device/live`);
      remove(deviceRef).catch(() => {});
    } catch { /* ignore */ }
  }
}

/**
 * Check if demo mode is currently active.
 */
export function isDemoActive() {
  return _active;
}

/**
 * Subscribe to demo mode state changes.
 * Callback receives: { active, glucose, heartRate, temperature }
 * Returns an unsubscribe function.
 */
export function subscribeDemoState(callback) {
  _listeners.push(callback);

  // Immediately send current state
  callback({
    active: _active,
    glucose: round1(_prevGlucose),
    heartRate: round1(_prevHR),
    temperature: round1(_prevTemp),
  });

  return () => {
    _listeners = _listeners.filter(cb => cb !== callback);
  };
}

// ── Data cleanup utilities ──────────────────────────────────────────────────

/**
 * Remove readings where glucose > 400 or temperature > 40 from Firebase.
 * Returns the number of readings removed.
 */
export async function clearBadReadings(patientId) {
  const readingsRef = ref(db, `users/${patientId}/readings`);
  const snap = await get(readingsRef);
  if (!snap.exists()) return 0;

  const data = snap.val();
  let removed = 0;

  const removePromises = [];
  for (const [key, reading] of Object.entries(data)) {
    const glucose = Number(reading.glucose);
    const temp = Number(reading.temperature);

    if (glucose > 400 || temp > 40) {
      removePromises.push(
        remove(ref(db, `users/${patientId}/readings/${key}`))
      );
      removed++;
    }
  }

  await Promise.all(removePromises);
  return removed;
}

/**
 * Push a fresh realistic starting reading for a patient.
 */
export async function pushFreshReading(patientId) {
  const ts = Date.now();
  const payload = {
    glucose:     118,
    heartRate:   76,
    temperature: 36.6,
    timestamp:   ts,
    source:      'sensor',
    userId:      patientId,
  };

  const readingRef = ref(db, `users/${patientId}/readings/${ts}`);
  await set(readingRef, payload);
  return payload;
}
