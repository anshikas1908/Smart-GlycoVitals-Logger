import { useState, useEffect, useCallback } from 'react';
import { ref, set } from 'firebase/database';
import { db } from '../firebase';
import { subscribeDeviceLive } from '../services/glucoseService';
import { subscribeDemoState } from '../services/demoMode';
import { useAuth } from '../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatus(glucose) {
  const g = Number(glucose);
  if (g > 300) return 'Crit High';
  if (g > 180) return 'High';
  if (g < 70)  return 'Low';
  return 'Normal';
}

const MEAL_OPTIONS = [
  'Before Breakfast', 'After Breakfast',
  'Before Lunch', 'After Lunch',
  'Before Dinner', 'After Dinner',
  'Bedtime', 'Fasting', 'Random',
];

function today() { return new Date().toISOString().slice(0, 10); }
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function glucoseColor(v) {
  if (!v || isNaN(v)) return '#6B7280';
  const n = Number(v);
  if (n < 70 || n > 180) return '#DC2626';
  if (n <= 140) return '#16A34A';
  return '#F59E0B';
}

function glucoseBorderClass(v) {
  if (!v || isNaN(v)) return '';
  const n = Number(v);
  if (n < 70 || n > 180) return 'border-red-500/70';
  if (n <= 140) return 'border-green-500/70';
  return 'border-yellow-500/70';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-32 right-6 z-[200] animate-fade-in">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-900 border border-green-500/40 rounded-2xl shadow-2xl shadow-black/60 text-green-400 font-semibold text-sm">
        <span className="text-xl">✅</span>{msg}
      </div>
    </div>
  );
}

function CriticalWarning({ glucose, onClose }) {
  const g = Number(glucose);
  const isLow = g < 70;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-red-500/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
        <div className="text-center mb-4">
          <div className="text-5xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-red-400">
            {isLow ? 'Low Glucose Detected!' : 'High Glucose Detected!'}
          </h3>
          <p className="text-red-300 font-bold text-xl mt-2">{glucose} mg/dL</p>
          <p className="text-gray-300 mt-2 text-sm">
            {isLow
              ? 'Please eat something immediately and consult your doctor.'
              : 'Please consult your doctor.'}
          </p>
        </div>
        <button onClick={onClose} className="btn-primary w-full py-2.5">
          I Understand
        </button>
      </div>
    </div>
  );
}

/** Animated shimmer placeholder while waiting for device data */
function SensorShimmer() {
  return (
    <div className="h-14 rounded-xl bg-gray-800/60 animate-pulse flex items-center px-4 gap-3">
      <div className="w-6 h-6 rounded-full bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-2 bg-gray-700 rounded w-24" />
        <div className="h-3 bg-gray-700 rounded w-16" />
      </div>
    </div>
  );
}

/** Live sensor value display panel (read-only from hardware) */
function SensorPanel({ icon, label, value, unit, isOnline, isLoading, onManualToggle, showManualToggle }) {
  const hasValue = value !== null && value !== undefined;

  if (isLoading) return <SensorShimmer />;

  return (
    <div className={`relative rounded-xl border px-4 py-3 transition-all duration-300 ${
      isOnline && hasValue
        ? 'bg-cyan-500/5 border-cyan-500/30'
        : 'bg-gray-800/40 border-gray-700/50'
    }`}>
      {/* Status badge */}
      <div className="absolute top-2 right-2">
        {isOnline && hasValue ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <span className="w-1 h-1 rounded-full bg-cyan-400 inline-block animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
            OFFLINE
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>

      {hasValue ? (
        <div className={`text-2xl font-bold ${isOnline ? 'text-cyan-300' : 'text-gray-300'}`}>
          {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : Math.round(value)}
          <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">No data from device</div>
      )}

      {showManualToggle && !isOnline && (
        <button
          onClick={onManualToggle}
          className="mt-2 text-[10px] text-amber-400 underline underline-offset-2 hover:text-amber-300 transition-colors"
        >
          Enter manually instead →
        </button>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function AddReadingModal({ patientId, readings = [], onClose }) {
  const { activePatientId } = useAuth();
  const userId = patientId || activePatientId || 'U001';

  const [form, setForm] = useState({
    glucose: '',
    date: today(),
    time: nowTime(),
    mealContext: 'Random',
    notes: '',
    // Manual fallback values (only used when device is offline)
    manualHR: '',
    manualTemp: '',
  });

  const [errors, setErrors]           = useState({});
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState('');
  const [showCritical, setShowCritical] = useState(false);
  const [quickStats, setQuickStats]   = useState(null);

  // ── Device state ─────────────────────────────────────────────────────────
  const [deviceData, setDeviceData]   = useState(null);  // null = loading, false = no device
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [manualHRMode, setManualHRMode]   = useState(false);
  const [manualTempMode, setManualTempMode] = useState(false);

  // ── ESP32 Demo Mode awareness ─────────────────────────────────────────────
  const [demoState, setDemoState] = useState({ active: false, glucose: 0, heartRate: 0, temperature: 0 });

  useEffect(() => {
    const unsub = subscribeDemoState(setDemoState);
    return () => unsub();
  }, []);

  // Subscribe to ESP32 live data
  useEffect(() => {
    const timeout = setTimeout(() => {
      // If after 5s still no device data, treat as "no device connected"
      setDeviceLoading(false);
    }, 5000);

    const unsub = subscribeDeviceLive(userId, (data) => {
      clearTimeout(timeout);
      setDeviceLoading(false);
      setDeviceData(data ?? false);
    });

    return () => { clearTimeout(timeout); unsub(); };
  }, [userId]);

  // When device goes offline, auto-enable manual mode
  useEffect(() => {
    if (deviceData && !deviceData.isOnline) {
      setManualHRMode(true);
      setManualTempMode(true);
    }
    if (deviceData?.isOnline) {
      // Device came back online — reset manual modes
      setManualHRMode(false);
      setManualTempMode(false);
    }
  }, [deviceData]);

  // ── Derived device state (needed before resolvedHR/Temp) ─────────────────
  const deviceIsOnline = demoState.active || deviceData?.isOnline === true;
  const effectiveHR   = demoState.active ? demoState.heartRate   : (deviceData?.heartRate   ?? null);
  const effectiveTemp = demoState.active ? demoState.temperature : (deviceData?.temperature ?? null);

  // Resolved sensor values (hardware preferred, manual fallback)
  const resolvedHR   = deviceIsOnline
    ? effectiveHR
    : (manualHRMode && form.manualHR ? Number(form.manualHR) : null);

  const resolvedTemp = deviceIsOnline
    ? effectiveTemp
    : (manualTempMode && form.manualTemp ? Number(form.manualTemp) : null);

  // Can we save? All 3 values must be present
  const canSave = !!form.glucose &&
    !isNaN(Number(form.glucose)) &&
    resolvedHR !== null &&
    resolvedTemp !== null;

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    const g = Number(form.glucose);
    if (!form.glucose) e.glucose = 'Glucose is required.';
    else if (g < 20 || g > 600) e.glucose = 'Glucose must be 20–600 mg/dL.';
    if (manualHRMode && form.manualHR) {
      const hr = Number(form.manualHR);
      if (hr < 30 || hr > 200) e.manualHR = 'Heart rate must be 30–200 bpm.';
    }
    if (manualTempMode && form.manualTemp) {
      const t = Number(form.manualTemp);
      if (t < 30 || t > 45) e.manualTemp = 'Temperature must be 30–45 °C.';
    }
    return e;
  };

  const computeQuickStats = useCallback((savedTimestamp) => {
    const todayStr = today();
    const todayReadings = [...readings, { glucose: Number(form.glucose), timestamp: savedTimestamp }]
      .filter(r => new Date(r.timestamp).toISOString().slice(0, 10) === todayStr);
    const count = todayReadings.length;
    const avg = count > 0 ? Math.round(todayReadings.reduce((s, r) => s + r.glucose, 0) / count) : 0;
    const sorted = [...readings].sort((a, b) => b.timestamp - a.timestamp);
    const lastPrev = sorted[0];
    let lastStr = 'No previous reading';
    if (lastPrev) {
      const diff = Math.round((savedTimestamp - lastPrev.timestamp) / 60000);
      if (diff < 60) lastStr = `${diff} min ago`;
      else lastStr = `${Math.round(diff / 60)} hr ago`;
    }
    setQuickStats({ count, avg, lastStr });
  }, [readings, form.glucose]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    if (!canSave) return;

    setSaving(true);
    try {
      const ts = Date.now();
      const glucoseNum = Number(form.glucose);
      const payload = {
        glucose:     glucoseNum,
        status:      getStatus(glucoseNum),
        timestamp:   ts,
        date:        form.date,
        time:        form.time,
        mealContext: form.mealContext,
        heartRate:   resolvedHR,
        temperature: resolvedTemp,
        entryType:   deviceData?.isOnline ? 'hardware' : 'manual',  // track source
      };
      // Record SpO2 if the hardware provided it
      if (deviceData?.isOnline && deviceData?.spo2) payload.spo2 = deviceData.spo2;
      if (form.notes.trim()) payload.notes = form.notes.trim();

      await set(ref(db, `users/${userId}/readings/${ts}`), payload);
      computeQuickStats(ts);
      setToast('Reading saved successfully! ✅');
      if (glucoseNum < 70 || glucoseNum > 180) setShowCritical(true);
    } catch {
      setErrors({ submit: 'Failed to save. Check connection.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <h2 className="text-lg font-bold text-white">➕ Add Reading</h2>
              <p className="text-xs text-gray-400 mt-0.5">Glucose manual · Vitals from sensor</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Device status pill */}
              {!deviceLoading && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  deviceIsOnline
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${deviceIsOnline ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
                  {demoState.active ? 'ESP32 Live ●' : deviceIsOnline ? 'Device Online' : 'Device Offline'}
                </span>
              )}
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all">✕</button>
            </div>
          </div>

          <div className="p-5 space-y-5">

            {/* ── Glucose (always manual) ─────────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                🩸 Glucose Level <span className="text-red-400">*</span>
                <span className="ml-2 text-gray-600 font-normal normal-case">Enter manually from your glucometer</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={form.glucose}
                  onChange={e => { upd('glucose', e.target.value); setErrors(er => ({ ...er, glucose: '' })); }}
                  placeholder="e.g. 120"
                  className={`input-field pr-16 text-lg font-bold transition-all ${glucoseBorderClass(form.glucose)}`}
                  style={{ color: glucoseColor(form.glucose) }}
                  min="20" max="600"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">mg/dL</span>
              </div>
              {form.glucose && !isNaN(form.glucose) && (
                <div className="mt-1.5 text-xs font-semibold" style={{ color: glucoseColor(form.glucose) }}>
                  {Number(form.glucose) < 70 ? '🔴 Low (Hypoglycemia)'
                    : Number(form.glucose) <= 140 ? '🟢 Normal range'
                    : Number(form.glucose) <= 180 ? '🟡 Slightly elevated'
                    : '🔴 High (Hyperglycemia)'}
                </div>
              )}
              {errors.glucose && <p className="text-red-400 text-xs mt-1">{errors.glucose}</p>}
            </div>

            {/* ── Vitals from hardware ────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  📡 Vitals from ESP32 Sensor
                </span>
                {deviceLoading && (
                  <span className="text-[10px] text-gray-500 animate-pulse">Connecting to device…</span>
                )}
              </div>

              {/* Online/Offline banner */}
              {!deviceLoading && deviceIsOnline ? (
                <div className="mb-3 flex items-start gap-2 px-3 py-2.5 bg-green-500/8 border border-green-500/25 rounded-xl text-green-400 text-xs">
                  <span className="text-base mt-0.5">✅</span>
                  <div>
                    <div className="font-semibold">Sensor device connected ✓</div>
                    <div className="text-green-400/70 mt-0.5">
                      {demoState.active
                        ? 'ESP32 Demo Mode active — live sensor values streaming in real time.'
                        : 'ESP32 sensor online — vitals are being read automatically.'}
                    </div>
                  </div>
                </div>
              ) : !deviceLoading && !deviceIsOnline && (
                <div className="mb-3 flex items-start gap-2 px-3 py-2.5 bg-amber-500/8 border border-amber-500/25 rounded-xl text-amber-400 text-xs">
                  <span className="text-base mt-0.5">⚠️</span>
                  <div>
                    <div className="font-semibold">Sensor device offline</div>
                    <div className="text-amber-400/70 mt-0.5">
                      ESP32 not connected. You can enter Heart Rate &amp; Temperature manually below.
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Heart Rate */}
                <div>
                  {!manualHRMode ? (
                    <SensorPanel
                      icon="💓"
                      label="Heart Rate"
                      value={effectiveHR}
                      unit="bpm"
                      isOnline={deviceIsOnline}
                      isLoading={deviceLoading && !demoState.active}
                      showManualToggle
                      onManualToggle={() => setManualHRMode(true)}
                    />
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                        💓 Heart Rate <span className="text-[10px] text-amber-400 font-normal normal-case ml-1">(manual)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={form.manualHR}
                          onChange={e => { upd('manualHR', e.target.value); setErrors(er => ({ ...er, manualHR: '' })); }}
                          placeholder="72"
                          className="input-field pr-10 text-sm"
                          min="30" max="200"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">bpm</span>
                      </div>
                      {deviceIsOnline && (
                        <button onClick={() => setManualHRMode(false)} className="mt-1 text-[10px] text-cyan-400 underline underline-offset-2">
                          ← Use sensor value
                        </button>
                      )}
                      {errors.manualHR && <p className="text-red-400 text-xs mt-1">{errors.manualHR}</p>}
                    </div>
                  )}
                </div>

                {/* Temperature */}
                <div>
                  {!manualTempMode ? (
                    <SensorPanel
                      icon="🌡️"
                      label="Temperature"
                      value={effectiveTemp}
                      unit="°C"
                      isOnline={deviceIsOnline}
                      isLoading={deviceLoading && !demoState.active}
                      showManualToggle
                      onManualToggle={() => setManualTempMode(true)}
                    />
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                        🌡️ Temperature <span className="text-[10px] text-amber-400 font-normal normal-case ml-1">(manual)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={form.manualTemp}
                          onChange={e => { upd('manualTemp', e.target.value); setErrors(er => ({ ...er, manualTemp: '' })); }}
                          placeholder="36.6"
                          className="input-field pr-6 text-sm"
                          step="0.1" min="30" max="45"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">°C</span>
                      </div>
                      {deviceIsOnline && (
                        <button onClick={() => setManualTempMode(false)} className="mt-1 text-[10px] text-cyan-400 underline underline-offset-2">
                          ← Use sensor value
                        </button>
                      )}
                      {errors.manualTemp && <p className="text-red-400 text-xs mt-1">{errors.manualTemp}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* SpO2 bonus display */}
              {deviceIsOnline && deviceData?.spo2 && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg text-xs text-cyan-400">
                  <span>🫁</span>
                  <span className="font-semibold">SpO₂: {Math.round(deviceData.spo2)}%</span>
                  <span className="text-cyan-400/60">(from MAX30102 — recorded with reading)</span>
                </div>
              )}
            </div>

            {/* ── Readiness indicator ─────────────────────────────────── */}
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition-all duration-300 ${
              canSave
                ? 'bg-green-500/8 border-green-500/25 text-green-400'
                : 'bg-gray-800/40 border-gray-700/40 text-gray-500'
            }`}>
              <span className="text-base">{canSave ? '✅' : '🔒'}</span>
              <div>
                {canSave
                  ? <span className="font-semibold">Ready to save · All 3 values collected</span>
                  : <span>
                      Waiting for:{' '}
                      {!form.glucose && <span className="text-red-400 font-medium">Glucose </span>}
                      {resolvedHR === null && <span className="text-amber-400 font-medium">Heart Rate </span>}
                      {resolvedTemp === null && <span className="text-amber-400 font-medium">Temperature</span>}
                    </span>
                }
              </div>
            </div>

            {/* ── Date + Time ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Date</label>
                <input type="date" value={form.date} onChange={e => upd('date', e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Time</label>
                <input type="time" value={form.time} onChange={e => upd('time', e.target.value)} className="input-field text-sm" />
              </div>
            </div>

            {/* ── Meal Context ────────────────────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Meal Context</label>
              <select value={form.mealContext} onChange={e => upd('mealContext', e.target.value)} className="input-field text-sm">
                {MEAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {/* ── Notes ───────────────────────────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                Notes <span className="text-gray-600 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={e => upd('notes', e.target.value.slice(0, 100))}
                placeholder="e.g. Felt dizzy after lunch..."
                rows={2}
                className="input-field text-sm resize-none"
              />
              <p className="text-xs text-gray-600 mt-0.5 text-right">{form.notes.length}/100</p>
            </div>

            {errors.submit && (
              <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-red-400 text-sm">{errors.submit}</div>
            )}

            {/* ── Quick stats after save ───────────────────────────────── */}
            {quickStats && (
              <div className="bg-primary/8 border border-primary/20 rounded-xl p-4 animate-fade-in">
                <p className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">Today's Summary</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-xl font-bold text-white">{quickStats.count}</div><div className="text-xs text-gray-400">Readings</div></div>
                  <div><div className="text-xl font-bold text-white">{quickStats.avg}</div><div className="text-xs text-gray-400">Avg mg/dL</div></div>
                  <div><div className="text-xs font-bold text-white">{quickStats.lastStr}</div><div className="text-xs text-gray-400">Last reading</div></div>
                </div>
              </div>
            )}

            {/* ── Actions ─────────────────────────────────────────────── */}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !canSave}
                title={!canSave ? 'Enter glucose and wait for sensor readings' : ''}
                className={`flex-1 py-2.5 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  canSave
                    ? 'btn-primary'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                }`}
              >
                {saving
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Saving…</span></>
                  : canSave ? '💾 Save & Predict' : '🔒 Waiting for vitals…'
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      {showCritical && <CriticalWarning glucose={form.glucose} onClose={() => { setShowCritical(false); onClose(); }} />}
    </>
  );
}
