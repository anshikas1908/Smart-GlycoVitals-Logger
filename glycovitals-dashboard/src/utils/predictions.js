/**
 * predictions.js
 * ──────────────
 * Dual-mode prediction engine for GlycoVitals.
 *
 * Mode 1: LSTM   — enough readings exist for the model (readings.length >= LSTM_MIN)
 *                   The actual predicted value comes from Firebase `predictions/` node.
 *                   This file just reads that node and tags it with mode="lstm".
 *
 * Mode 2: Fallback — fewer than LSTM_MIN readings.
 *                   We compute a local estimate using:
 *                   a) Linear trend (least-squares on last min(5, N) readings × 30 min)
 *                   b) If only 1 reading, return the same value (no change)
 *                   Prediction is tagged mode="fallback".
 */

export const LSTM_MIN = 12; // minimum readings required for LSTM

// ── Fallback: linear regression on glucose vs time ──────────────────────────

/**
 * Fit a simple linear regression to (timestamp, glucose) pairs.
 * Returns the predicted glucose 30 minutes after the last reading.
 */
function linearTrendPrediction(readings) {
  // Use at most 5 most-recent valid readings
  const sample = readings.filter(r => r.glucose !== undefined && r.glucose !== null && !Number.isNaN(Number(r.glucose))).slice(-5);
  if (sample.length < 2) return sample.length === 1 ? Number(sample[0].glucose) : null;

  const n = sample.length;
  const xs = sample.map(r => Number(r.timestamp));
  const ys = sample.map(r => Number(r.glucose));

  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  const num = xs.reduce((acc, x, i) => acc + (x - xMean) * (ys[i] - yMean), 0);
  const den = xs.reduce((acc, x) => acc + Math.pow(x - xMean, 2), 0);

  if (den === 0) return yMean; // all same timestamp — just return avg

  const slope = num / den; // glucose change per ms
  const intercept = yMean - slope * xMean;

  const futureTs = xs[xs.length - 1] + 30 * 60 * 1000; // 30 min ahead
  const prediction = slope * futureTs + intercept;

  // Clamp to physiologically reasonable range
  return Math.max(40, Math.min(600, prediction));
}

// ── Alert generator (shared between modes) ────────────────────────────────────

export function generateAlerts(current, predicted) {
  const alerts = [];
  if (current < 54) alerts.push('Critical low glucose — seek immediate medical help');
  else if (current < 70) alerts.push('Low glucose warning — consider a snack');
  else if (current > 250) alerts.push('Critical high glucose — check insulin dosage');
  else if (current > 180) alerts.push('High glucose warning — monitor closely');

  if (predicted !== null) {
    if (predicted < 70 && current >= 70)
      alerts.push('Glucose predicted to drop below normal in 30 min');
    if (predicted > 180 && current <= 180)
      alerts.push('Glucose predicted to rise above normal in 30 min');
  }
  return alerts;
}

// ── Trend calculator ──────────────────────────────────────────────────────────

/**
 * getTrend: returns direction and delta based on last 3 readings.
 * Readings should be oldest→newest.
 */
export function getTrend(readings) {
  if (!readings || readings.length < 2) return { direction: 'stable', delta: 0, arrow: '→' };

  const recent = readings.slice(-3);
  const first = recent[0]?.glucose ?? 0;
  const last  = recent[recent.length - 1]?.glucose ?? 0;
  const delta = Math.round(last - first);

  if (delta > 5)  return { direction: 'up',     delta, arrow: '↑' };
  if (delta < -5) return { direction: 'down',   delta, arrow: '↓' };
  return               { direction: 'stable', delta, arrow: '→' };
}

// ── Main: compute prediction for any patient state ────────────────────────────

/**
 * computePrediction(readings, firebasePrediction)
 *
 * @param {Array}   readings           – all readings, sorted oldest→newest
 * @param {object|null} firebasePred   – latest prediction object from Firebase (or null)
 *
 * @returns {object} {
 *   predicted30min: number | null,
 *   mode: 'lstm' | 'fallback' | 'none',
 *   alerts: string[],
 *   readingsNeeded: number,   // how many more readings before LSTM kicks in
 *   confidence: 'high' | 'low' | 'none',
 * }
 */
export function computePrediction(readings, firebasePred) {
  const count = readings.length;
  const currentGlucose = readings[count - 1]?.glucose ?? null;
  const readingsNeeded = Math.max(0, LSTM_MIN - count);

  // ─ No data at all
  if (count === 0 || currentGlucose === null) {
    return { predicted30min: null, mode: 'none', alerts: [], readingsNeeded: LSTM_MIN, confidence: 'none' };
  }

  // ─ LSTM mode: use Firebase prediction if available and recent (within 2 hours)
  if (count >= LSTM_MIN && firebasePred) {
    const ageMs = Date.now() - (firebasePred.timestamp ?? 0);
    const isRecent = ageMs < 2 * 60 * 60 * 1000; // 2-hour freshness window

    if (isRecent && firebasePred.predicted30min) {
      return {
        predicted30min: firebasePred.predicted30min,
        mode: 'lstm',
        alerts: firebasePred.alerts ?? generateAlerts(currentGlucose, firebasePred.predicted30min),
        readingsNeeded: 0,
        confidence: 'high',
        modelRMSE: firebasePred.modelRMSE ?? null,
      };
    }
  }

  // ─ Fallback mode: compute locally
  const predicted30min = linearTrendPrediction(readings);
  return {
    predicted30min: predicted30min !== null ? Math.round(predicted30min) : null,
    mode: count >= LSTM_MIN ? 'lstm-stale' : 'fallback', // lstm-stale = LSTM not run yet for this session
    alerts: generateAlerts(currentGlucose, predicted30min),
    readingsNeeded,
    confidence: count >= 5 ? 'medium' : 'low',
  };
}
