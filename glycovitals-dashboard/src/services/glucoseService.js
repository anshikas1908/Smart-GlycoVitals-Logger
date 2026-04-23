/**
 * glucoseService.js
 * ─────────────────
 * Centralized Firebase helpers for all glucose-related data operations.
 * Import from here instead of duplicating ref/get/push calls in every page.
 *
 * Key exports:
 *   pushReading            – write a new reading
 *   fetchAllReadings       – one-time fetch, all readings newest-first
 *   pushPrediction         – write a prediction (from Python LSTM or fallback)
 *   fetchLatestPrediction  – one-time fetch of most-recent prediction
 *   fetchRecentPredictions – one-time fetch for analytics
 *   subscribeLatestPrediction – real-time onValue listener (returns unsubscribe fn)
 *   fetchPatientProfile    – basic profile fields
 *   DEMO_READINGS          – mock data when Firebase is unreachable
 *   DEMO_PREDICTION        – mock prediction for offline/demo mode
 */

import { ref, push, get, set, query, orderByChild, limitToLast, onValue } from 'firebase/database';
import { db } from '../firebase';

// ── Readings ──────────────────────────────────────────────────────────────────

/**
 * Push a new reading for a patient.
 * @param {string} patientId
 * @param {object} readingData  – { glucose, heartRate, temperature, mealContext, notes, timestamp, status }
 */
export async function pushReading(patientId, readingData) {
  const readingsRef = ref(db, `users/${patientId}/readings`);
  return push(readingsRef, {
    ...readingData,
    timestamp: readingData.timestamp ?? Date.now(),
  });
}

/**
 * Fetch all readings for a patient (one-time, newest first).
 */
export async function fetchAllReadings(patientId) {
  const snap = await get(ref(db, `users/${patientId}/readings`));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ── Predictions ───────────────────────────────────────────────────────────────

/**
 * Push a prediction object for a patient.
 * @param {string} patientId
 * @param {object} predPayload – { predicted30min, currentGlucose, alerts, modelRMSE, predictionMode, timestamp }
 */
export async function pushPrediction(patientId, predPayload) {
  return push(ref(db, `users/${patientId}/predictions`), {
    ...predPayload,
    generatedAt: Date.now(),
  });
}

/**
 * Fetch the single most-recent prediction for a patient (one-time).
 */
export async function fetchLatestPrediction(patientId) {
  const q = query(
    ref(db, `users/${patientId}/predictions`),
    orderByChild('timestamp'),
    limitToLast(1)
  );
  const snap = await get(q);
  if (!snap.exists()) return null;
  const arr = Object.values(snap.val());
  return arr[arr.length - 1];
}

/**
 * Subscribe to the latest prediction for a patient in real time.
 * Returns an unsubscribe function — call it on component unmount.
 *
 * @param {string}   patientId
 * @param {Function} callback  – called with (predictionObject | null)
 * @returns {Function} unsubscribe
 */
export function subscribeLatestPrediction(patientId, callback) {
  if (!patientId) {
    callback(null);
    return () => {};
  }
  const q = query(
    ref(db, `users/${patientId}/predictions`),
    orderByChild('timestamp'),
    limitToLast(1)
  );
  const unsub = onValue(q, (snap) => {
    if (snap.exists()) {
      const arr = Object.values(snap.val());
      callback(arr[arr.length - 1]);
    } else {
      callback(null);
    }
  }, () => callback(null));
  return unsub;
}

// ── Device (ESP32 Hardware) ───────────────────────────────────────────────────

/** Device is considered ONLINE if it sent a reading within this many ms */
const DEVICE_ONLINE_THRESHOLD_MS = 30_000;

/**
 * Subscribe to real-time ESP32 sensor data for a patient.
 * ESP32 writes to: users/{userId}/device/live
 * Calls callback with:
 *   { heartRate, temperature, spo2, timestamp, isOnline } | null
 *
 * Returns an unsubscribe function — call it on component unmount.
 *
 * @param {string}   userId
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function subscribeDeviceLive(userId, callback) {
  if (!userId) { callback(null); return () => {}; }
  const liveRef = ref(db, `users/${userId}/device/live`);
  const unsub = onValue(liveRef, (snap) => {
    if (snap.exists()) {
      const data = snap.val();
      const isOnline = Date.now() - (data.timestamp ?? 0) < DEVICE_ONLINE_THRESHOLD_MS;
      callback({ ...data, isOnline });
    } else {
      callback(null);
    }
  }, () => callback(null));
  return unsub;
}

/**
 * Fetch recent predictions for analytics (up to `limit`).
 */
export async function fetchRecentPredictions(patientId, limit = 50) {
  const snap = await get(ref(db, `users/${patientId}/predictions`));
  if (!snap.exists()) return [];
  
  const arr = Object.entries(snap.val())
    .map(([id, v]) => ({ id, ...v, timestamp: new Date(v.timestamp).getTime() }))
    .sort((a, b) => a.timestamp - b.timestamp);
    
  return arr.slice(-limit);
}

// ── Patient Profile ───────────────────────────────────────────────────────────

/**
 * Fetch basic profile fields for a patient.
 */
export async function fetchPatientProfile(patientId) {
  const snap = await get(ref(db, `users/${patientId}`));
  if (!snap.exists()) return null;
  const data = snap.val();
  // Strip large nested objects like readings/predictions from the profile
  const { readings: _r, predictions: _p, ...profile } = data;
  return profile;
}

// ── Demo / Mock fallback ──────────────────────────────────────────────────────
// Used when Firebase is unreachable (demo mode).
// 14 readings ≥ LSTM_MIN (12) — so demo shows LSTM-active state.

const _now = Date.now();
export const DEMO_READINGS = [
  { id: 'demo-01', glucose: 98,  heartRate: 70, temperature: 36.5, timestamp: _now - 780 * 60000, mealContext: 'Fasting',          status: 'Normal'    },
  { id: 'demo-02', glucose: 112, heartRate: 72, temperature: 36.6, timestamp: _now - 660 * 60000, mealContext: 'After Breakfast',   status: 'Normal'    },
  { id: 'demo-03', glucose: 185, heartRate: 80, temperature: 36.8, timestamp: _now - 540 * 60000, mealContext: 'After Lunch',       status: 'High'      },
  { id: 'demo-04', glucose: 145, heartRate: 78, temperature: 36.7, timestamp: _now - 480 * 60000, mealContext: 'After Dinner',      status: 'High'      },
  { id: 'demo-05', glucose: 52,  heartRate: 88, temperature: 36.4, timestamp: _now - 420 * 60000, mealContext: 'Fasting',          status: 'Crit Low'  },
  { id: 'demo-06', glucose: 95,  heartRate: 69, temperature: 36.5, timestamp: _now - 360 * 60000, mealContext: 'After Snack',       status: 'Normal'    },
  { id: 'demo-07', glucose: 130, heartRate: 74, temperature: 36.6, timestamp: _now - 300 * 60000, mealContext: 'Post-Exercise',     status: 'Normal'    },
  { id: 'demo-08', glucose: 210, heartRate: 82, temperature: 36.9, timestamp: _now - 240 * 60000, mealContext: 'After Lunch',       status: 'Crit High' },
  { id: 'demo-09', glucose: 175, heartRate: 79, temperature: 36.7, timestamp: _now - 180 * 60000, mealContext: 'After Dinner',      status: 'High'      },
  { id: 'demo-10', glucose: 88,  heartRate: 68, temperature: 36.5, timestamp: _now - 120 * 60000, mealContext: 'Fasting',          status: 'Normal'    },
  { id: 'demo-11', glucose: 104, heartRate: 71, temperature: 36.6, timestamp: _now -  90 * 60000, mealContext: 'After Snack',       status: 'Normal'    },
  { id: 'demo-12', glucose: 135, heartRate: 75, temperature: 36.7, timestamp: _now -  60 * 60000, mealContext: 'After Breakfast',   status: 'Normal'    },
  { id: 'demo-13', glucose: 118, heartRate: 73, temperature: 36.6, timestamp: _now -  30 * 60000, mealContext: 'Post-Exercise',     status: 'Normal'    },
  { id: 'demo-14', glucose: 126, heartRate: 76, temperature: 36.7, timestamp: _now -  10 * 60000, mealContext: 'After Dinner',      status: 'Normal'    },
];

export const DEMO_PREDICTION = {
  timestamp:       _now - 10 * 60000,
  currentGlucose:  126,
  predicted30min:  138,
  modelRMSE:       8.42,
  predictionMode:  'lstm',
  alerts:          [],
  generatedAt:     _now - 10 * 60000,
};
