"""
push_predictions.py
───────────────────
Smart GlycoVitals Logger — LSTM + Fallback Prediction Pusher

Reads glucose readings for one or more patients from Firebase,
runs the trained LSTM model (models/glucose_lstm_model.h5) or a
linear-trend fallback (when readings < SEQUENCE_LEN), and writes the
prediction back to:

  users/{patientId}/predictions/{pushKey}

Payload structure (matches what the React frontend expects):
  {
    "timestamp":        <ms epoch of latest reading>,
    "currentGlucose":  <latest glucose mg/dL>,
    "predicted30min":  <predicted glucose 30 min ahead>,
    "modelRMSE":       <fixed RMSE from training, or null for fallback>,
    "predictionMode":  "lstm" | "fallback",
    "alerts":          [...]
  }

Usage:
  python push_predictions.py                   # all patients U001-U010
  python push_predictions.py U001 U003         # specific patients
  python push_predictions.py --patient U002    # single patient flag
  python push_predictions.py --loop 300        # poll every 300 seconds

Requirements:
  pip install firebase-admin tensorflow scikit-learn numpy
"""

import sys
import os
import time
import pickle
import numpy as np
from datetime import datetime

# ── Path setup ───────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR  = os.path.dirname(SCRIPT_DIR)
MODEL_PATH   = os.path.join(PROJECT_DIR, 'models', 'glucose_lstm_model.h5')
SCALER_PATH  = os.path.join(PROJECT_DIR, 'models', 'scaler.pkl')
KEY_PATH     = os.path.join(PROJECT_DIR, 'serviceAccountKey.json')
DATABASE_URL = 'https://smart-glycovitals-logger-default-rtdb.asia-southeast1.firebasedatabase.app'

# Number of past readings the LSTM uses as input window
SEQUENCE_LEN = 12

# Published RMSE from model training (update if you retrain)
MODEL_RMSE = 8.42

# ── Firebase init ─────────────────────────────────────────────────────────────
import firebase_admin
from firebase_admin import credentials, db as fdb

cred = credentials.Certificate(KEY_PATH)
firebase_admin.initialize_app(cred, {'databaseURL': DATABASE_URL})

# ── Load model & scaler ───────────────────────────────────────────────────────
_model  = None
_scaler = None

def load_model_and_scaler():
    """Lazy-load model + scaler; sets globals. Returns True if successful."""
    global _model, _scaler
    if _model and _scaler:
        return True
    try:
        from tensorflow.keras.models import load_model  # type: ignore
        print("  📦 Loading LSTM model…")
        _model = load_model(MODEL_PATH)
        print("  📦 Loading scaler…")
        with open(SCALER_PATH, 'rb') as f:
            _scaler = pickle.load(f)
        print("  ✅ Model ready.\n")
        return True
    except Exception as e:
        print(f"  ⚠️  Could not load LSTM model ({e}). Will use fallback for all patients.\n")
        return False

# ── Safe type converters ─────────────────────────────────────────────────────

def _to_float(val, default=None):
    """Convert val to float; return default on failure."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def _to_int(val, default=0):
    """Convert val to int; return default on failure."""
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default

# ── Alert generator ───────────────────────────────────────────────────────────
def generate_alerts(current: float, predicted: float) -> list:
    alerts = []
    if current < 54:
        alerts.append("Critical low glucose — seek immediate medical help")
    elif current < 70:
        alerts.append("Low glucose warning — consider a snack")
    elif current > 250:
        alerts.append("Critical high glucose — check insulin dosage")
    elif current > 180:
        alerts.append("High glucose warning — monitor closely")

    if predicted < 70 and current >= 70:
        alerts.append("Glucose predicted to drop below normal in 30 min")
    if predicted > 180 and current <= 180:
        alerts.append("Glucose predicted to rise above normal in 30 min")
    return alerts

# ── Fallback: linear-trend prediction ─────────────────────────────────────────
def linear_trend_prediction(glucose_values: list) -> float:
    """
    Fit a simple linear regression to glucose values (evenly spaced, 1 step = 1 unit).
    Returns the predicted value one step beyond the last reading.
    """
    n = len(glucose_values)
    if n == 0:
        return 100.0  # safe default

    if n == 1:
        return float(glucose_values[0])

    # Use the last min(5, n) readings
    sample = glucose_values[-min(5, n):]
    xs = list(range(len(sample)))
    ys = sample

    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    den = sum((x - x_mean) ** 2 for x in xs)

    if den == 0:
        return float(y_mean)

    slope     = num / den
    intercept = y_mean - slope * x_mean
    next_x    = xs[-1] + 1
    pred      = slope * next_x + intercept

    # Clamp to physiologically reasonable range
    return max(40.0, min(600.0, pred))

# ── Prediction for one patient ─────────────────────────────────────────────────
def predict_for_patient(patient_id: str, model_available: bool):
    ts_str = datetime.now().strftime('%H:%M:%S')
    print(f"[{ts_str}] ── {patient_id} ──────────────────────────────────")

    # Fetch readings from Firebase
    readings_ref = fdb.reference(f'users/{patient_id}/readings')
    snap = readings_ref.get()

    if not snap:
        print(f"  ⚠️  No readings found for {patient_id}. Skipping.\n")
        return

    # Coerce timestamp to int so string/int comparisons never crash
    readings = sorted(
        snap.values(),
        key=lambda r: _to_int(r.get('timestamp', 0))
    )

    # Extract glucose values — skip any reading with a non-numeric glucose
    glucose_values = []
    for r in readings:
        g = _to_float(r.get('glucose'))
        if g is not None:
            glucose_values.append(g)
        else:
            print(f"  ⚠️  Skipped reading with invalid glucose value: {r.get('glucose')!r}")
    n = len(glucose_values)

    if n == 0:
        print(f"  ⚠️  No valid glucose readings for {patient_id}. Skipping.\n")
        return

    latest_reading  = readings[-1]
    current_glucose = _to_float(latest_reading.get('glucose'), default=glucose_values[-1])
    latest_ts       = _to_int(latest_reading.get('timestamp'), default=int(time.time() * 1000))

    # ── Choose prediction mode ────────────────────────────────────────────────
    use_lstm = model_available and n >= SEQUENCE_LEN

    if use_lstm:
        # LSTM path
        window     = glucose_values[-SEQUENCE_LEN:]
        arr        = np.array(window, dtype=np.float32).reshape(-1, 1)
        arr_scaled = _scaler.transform(arr)
        X          = arr_scaled.reshape(1, SEQUENCE_LEN, 1)
        pred_scaled  = _model.predict(X, verbose=0)
        pred_glucose = float(_scaler.inverse_transform(pred_scaled)[0][0])
        pred_glucose = max(40.0, min(600.0, pred_glucose))
        mode         = 'lstm'
        rmse         = MODEL_RMSE
    else:
        # Fallback path — linear trend
        pred_glucose = round(linear_trend_prediction(glucose_values), 1)
        mode         = 'fallback'
        rmse         = None
        reason       = f'only {n}/{SEQUENCE_LEN} readings' if not model_available else f'{n}/{SEQUENCE_LEN} readings'
        print(f"  📈 Using fallback prediction ({reason})")

    alerts = generate_alerts(current_glucose, pred_glucose)

    payload = {
        'timestamp':       latest_ts,
        'currentGlucose':  round(current_glucose, 1),
        'predicted30min':  round(pred_glucose, 1),
        'predictionMode':  mode,
        'alerts':          alerts,
        'generatedAt':     int(time.time() * 1000),
    }
    if rmse is not None:
        payload['modelRMSE'] = rmse

    # Push to Firebase
    fdb.reference(f'users/{patient_id}/predictions').push(payload)

    mode_icon = '🧠' if mode == 'lstm' else '📈'
    status_icon = '✅' if not alerts else '⚠️'
    print(f"  {mode_icon} {mode.upper()} | {status_icon} current={current_glucose:.1f} → predicted={pred_glucose:.1f} | alerts: {alerts or 'none'}")
    print(f"  ✔  Pushed to users/{patient_id}/predictions\n")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    args = sys.argv[1:]

    # ── --loop N flag ─────────────────────────────────────────────────────────
    loop_interval = None
    if '--loop' in args:
        idx = args.index('--loop')
        try:
            loop_interval = int(args[idx + 1])
            args = [a for i, a in enumerate(args) if i != idx and i != idx + 1]
        except (IndexError, ValueError):
            print('Error: --loop requires an integer interval in seconds (e.g. --loop 300)')
            sys.exit(1)

    # ── --patient U001 flag ───────────────────────────────────────────────────
    if '--patient' in args:
        idx = args.index('--patient')
        try:
            args = [args[idx + 1]]
        except IndexError:
            print('Error: --patient requires a patient ID (e.g. --patient U001)')
            sys.exit(1)

    default_patients = [f'U{str(i).zfill(3)}' for i in range(1, 11)]  # U001–U010
    target_patients  = args if args else default_patients

    # Load LSTM model once (fallback used if this fails)
    model_available = load_model_and_scaler()

    def run_once():
        print(f'\n🔄 Running predictions for: {target_patients}')
        failed = []
        for pid in target_patients:
            try:
                predict_for_patient(pid.strip().upper(), model_available)
            except Exception as e:
                print(f'  ❌ Error for {pid}: {e}\n')
                failed.append(pid)
        if failed:
            print(f'⚠️  Failed patients: {failed}')
        else:
            print('✅ All predictions pushed successfully.')
        return failed

    if loop_interval:
        print(f'🔁 Loop mode enabled — running every {loop_interval}s. Ctrl+C to stop.\n')
        try:
            while True:
                run_once()
                print(f'⏳ Waiting {loop_interval}s until next run…')
                time.sleep(loop_interval)
        except KeyboardInterrupt:
            print('\n⛔ Loop stopped by user.')
    else:
        failed = run_once()
        sys.exit(1 if failed else 0)
