import { useState, useEffect, useRef } from 'react';
import { ref, query, orderByChild, limitToLast, onValue } from 'firebase/database';
import { db } from '../firebase';
import { computePrediction } from '../utils/predictions';
import { getTrend } from '../utils/glucose';
import {
  subscribeLatestPrediction,
  DEMO_READINGS,
  DEMO_PREDICTION,
} from '../services/glucoseService';

// ── useAllReadings ─────────────────────────────────────────────────────────────
// Real-time listener for ALL readings, newest-first.
// Includes `error` state and auto-demo-mode fallback after Firebase timeout.

export function useAllReadings(patientId) {
  const [readings,   setReadings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }

    setLoading(true);
    setError(null);
    setIsDemoMode(false);

    // 6-second timeout → switch to demo data if Firebase hasn't responded
    const demoTimer = setTimeout(() => {
      setReadings(DEMO_READINGS);
      setIsDemoMode(true);
      setLoading(false);
    }, 6000);

    const readingsRef = ref(db, `users/${patientId}/readings`);
    const unsub = onValue(
      readingsRef,
      (snap) => {
        clearTimeout(demoTimer);
        setError(null);
        setIsDemoMode(false);
        const data = snap.val();
        if (data) {
          const arr = Object.entries(data)
            .map(([k, v]) => ({ id: k, ...v, timestamp: new Date(v.timestamp).getTime() }))
            .sort((a, b) => b.timestamp - a.timestamp);
          setReadings(arr);
        } else {
          setReadings([]);
        }
        setLoading(false);
      },
      (err) => {
        clearTimeout(demoTimer);
        setError(err.message);
        setReadings(DEMO_READINGS);
        setIsDemoMode(true);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(demoTimer);
      unsub();
    };
  }, [patientId]);

  return { readings, loading, error, isDemoMode };
}

// ── usePatientData ─────────────────────────────────────────────────────────────
// Combined readings + prediction in one hook (used by legacy consumers).

export function usePatientData(patientId) {
  const [readings,   setReadings]   = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    if (!patientId) return;

    const readingsRef = ref(db, `users/${patientId}/readings`);
    const unsubReadings = onValue(readingsRef, (snap) => {
      setError(null);
      const data = snap.val();
      if (data) {
        const arr = Object.entries(data)
          .map(([k, v]) => ({ id: k, ...v }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setReadings(arr);
      } else {
        setReadings([]);
      }
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    const unsubPred = subscribeLatestPrediction(patientId, setPrediction);

    return () => {
      unsubReadings();
      unsubPred();
    };
  }, [patientId]);

  return { readings, prediction, loading, error };
}

// ── useAllPredictions ──────────────────────────────────────────────────────────
// Real-time listener for up to 200 recent predictions (analytics use).

export function useAllPredictions(patientId) {
  const [predictions, setPredictions] = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    const predRef = query(
      ref(db, `users/${patientId}/predictions`),
      orderByChild('timestamp'),
      limitToLast(200)
    );
    const unsub = onValue(predRef, (snap) => {
      const data = snap.val();
      if (data) {
        const arr = Object.entries(data)
          .map(([k, v]) => ({ id: k, ...v }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setPredictions(arr);
      } else {
        setPredictions([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [patientId]);

  return { predictions, loading };
}

// ── usePrediction ──────────────────────────────────────────────────────────────
/**
 * Dual-mode prediction hook.
 * Wraps computePrediction() to select LSTM vs Fallback automatically.
 *
 * @param {string} patientId
 * @param {Array}  readings      – sorted oldest → newest
 * @param {boolean} isDemoMode   – use DEMO_PREDICTION when true
 *
 * Returns: { predicted30min, mode, alerts, readingsNeeded, confidence, trend, loading }
 */
export function usePrediction(patientId, readings = [], isDemoMode = false) {
  const [firebasePred, setFirebasePred] = useState(null);
  const [predLoading,  setPredLoading]  = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      setFirebasePred(DEMO_PREDICTION);
      setPredLoading(false);
      return;
    }
    if (!patientId) { setPredLoading(false); return; }

    const unsub = subscribeLatestPrediction(patientId, (pred) => {
      setFirebasePred(pred);
      setPredLoading(false);
    });
    return () => unsub();
  }, [patientId, isDemoMode]);

  // Compute prediction from the dual-mode engine
  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
  const result = computePrediction(sorted, firebasePred);
  const trend  = getTrend(sorted);

  return { ...result, trend, loading: predLoading };
}
