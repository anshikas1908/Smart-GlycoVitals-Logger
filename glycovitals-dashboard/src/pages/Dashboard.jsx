import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useAllReadings, usePrediction } from '../hooks/usePatientData';
import { getGlucoseColor, getGlucoseLabel, getGlucoseStatus, getGlucoseStatus as statusOf, calculateTIR } from '../utils/glucose';
import { LSTM_MIN } from '../utils/predictions';
import SystemFlowBanner from '../components/SystemFlowBanner';

// ── Chart time-range windows ──────────────────────────────────────────────────
const CHART_RANGES = [
  { key: '1h',  label: '1H',   ms: 1  * 60 * 60 * 1000 },
  { key: '6h',  label: '6H',   ms: 6  * 60 * 60 * 1000 },
  { key: '24h', label: '24H',  ms: 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All',  ms: null },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(ts) {
  if (!ts) return null;
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.round(diffMin / 60)}h ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PredictionModeBadge({ mode }) {
  if (mode === 'lstm') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block animate-pulse" />
        LSTM Model
      </span>
    );
  }
  if (mode === 'fallback' || mode === 'lstm-stale') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        Fallback Avg
      </span>
    );
  }
  return null;
}

function TrendChip({ trend, className = '' }) {
  if (!trend) return null;
  const { arrow, direction, delta } = trend;
  const color = direction === 'up' ? 'text-amber-400' : direction === 'down' ? 'text-blue-400' : 'text-gray-400';
  return (
    <span className={`text-xl font-black ${color} ${className}`} title={`${delta > 0 ? '+' : ''}${delta} mg/dL trend`}>
      {arrow}
    </span>
  );
}

function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-success/10 border border-success/30 animate-fade-in">
        <span className="text-xl">✅</span>
        <div>
          <div className="font-semibold text-green-400 text-sm">All Clear</div>
          <div className="text-xs text-gray-400">Glucose levels are within normal range</div>
        </div>
      </div>
    );
  }
  const isCritical = alerts.some(a => a.toLowerCase().includes('critical') || a.toLowerCase().includes('severe'));
  return (
    <div className={`flex items-start gap-3 px-5 py-3.5 rounded-xl animate-fade-in ${
      isCritical ? 'bg-danger/10 border border-danger/30' : 'bg-warning/10 border border-warning/30'
    }`}>
      <span className="text-xl mt-0.5">{isCritical ? '🚨' : '⚠️'}</span>
      <div>
        <div className={`font-semibold text-sm ${isCritical ? 'text-red-400' : 'text-yellow-400'}`}>
          {isCritical ? 'Critical Alert' : 'Warning'}
        </div>
        <div className="text-xs text-gray-300 mt-0.5">{alerts.join(' · ')}</div>
      </div>
    </div>
  );
}

function GlucoseCard({ value, label, mode, isPrediction, timestamp, predTimestamp, trend }) {
  const color  = getGlucoseColor(value);
  const status = getGlucoseLabel(value);
  const sev    = getGlucoseStatus(value);

  const glowClass = (() => {
    if (sev === 'critical-low' || sev === 'critical-high') return 'glow-ring-critical';
    if (sev === 'low')    return 'glow-ring-low';
    if (sev === 'high')   return 'glow-ring-high';
    if (sev === 'normal') return 'glow-ring-normal';
    return '';
  })();

  const tsDisplay = isPrediction
    ? (predTimestamp ? `Prediction for: ${formatDateTime(predTimestamp)}` : null)
    : (timestamp ? `Last: ${formatDateTime(timestamp)}` : null);

  return (
    <div className={`card-hover relative overflow-hidden ${glowClass}`}>
      {/* Background glow blob */}
      <div className="absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl animate-glow"
           style={{ background: `${color}22` }} />
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</div>
          {mode && <div className="mt-1"><PredictionModeBadge mode={mode} /></div>}
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
          sev === 'normal'
            ? 'bg-success/15 text-green-400 border-success/30'
            : (sev === 'critical-low' || sev === 'critical-high')
            ? 'bg-danger/15 text-red-400 border-danger/30'
            : 'bg-warning/15 text-yellow-400 border-warning/30'
        }`}>{status}</span>
      </div>
      <div className="flex items-end gap-2">
        <div className="text-5xl font-bold tracking-tight" style={{ color }}>
          {value !== null && value !== undefined ? Math.round(value) : '—'}
        </div>
        <div className="text-gray-400 mb-1.5 text-sm font-medium">mg/dL</div>
        {!isPrediction && trend && <TrendChip trend={trend} className="mb-1" />}
      </div>
      {tsDisplay && <div className="text-xs text-gray-500 mt-2">{tsDisplay}</div>}
    </div>
  );
}

function VitalCard({ icon, label, value, unit, sub }) {
  return (
    <div className="card-hover">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <div className="text-3xl font-bold text-white">{value || '—'}</div>
        <div className="text-gray-400 mb-1 text-sm">{unit}</div>
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1.5">{sub}</div>}
    </div>
  );
}

function TIRStats({ readings }) {
  const stats = calculateTIR(readings);
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
        <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
        Time-in-Range Statistics
      </h3>
      <div className="flex h-4 rounded-full overflow-hidden mb-3">
        <div className="bg-danger/70 transition-all duration-700" style={{ width: `${stats.below}%` }} />
        <div className="bg-success/70 transition-all duration-700" style={{ width: `${stats.tir}%` }} />
        <div className="bg-warning/70 transition-all duration-700" style={{ width: `${stats.above}%` }} />
      </div>
      <div className="flex gap-3 text-xs mb-5">
        <span className="text-red-400">⬤ Low {stats.below}%</span>
        <span className="text-green-400">⬤ In Range {stats.tir}%</span>
        <span className="text-yellow-400">⬤ High {stats.above}%</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'TIR',     value: `${stats.tir}%`,   sub: 'Target ≥70%',   color: stats.tir >= 70 ? '#16A34A' : '#DC2626' },
          { label: 'GMI',     value: stats.gmi,          sub: 'Est. HbA1c %',  color: '#0097A7' },
          { label: 'Average', value: `${stats.avg}`,     sub: 'mg/dL',         color: '#9CA3AF' },
          { label: 'CV',      value: `${stats.cv}%`,     sub: 'Target <36%',   color: stats.cv < 36 ? '#16A34A' : '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-gray-400 font-semibold mt-0.5">{s.label}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass border border-gray-700 rounded-xl px-4 py-3 text-sm shadow-xl">
      <div className="text-gray-400 text-xs mb-1">{d.time}</div>
      <div className="font-bold" style={{ color: getGlucoseColor(d.glucose) }}>
        {Math.round(d.glucose)} <span className="text-gray-400 font-normal text-xs">mg/dL</span>
      </div>
      {d.mealContext && <div className="text-gray-500 text-xs mt-0.5">{d.mealContext}</div>}
    </div>
  );
};

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, activePatientId } = useAuth();
  const patientId = activePatientId || 'U001';

  const { readings, loading, error, isDemoMode } = useAllReadings(patientId);
  const [chartRange, setChartRange] = useState('24h');

  const {
    predicted30min,
    mode: predMode,
    alerts,
    readingsNeeded,
    trend,
    loading: predLoading,
  } = usePrediction(patientId, readings, isDemoMode);

  // Most-recent reading (readings is newest-first)
  const latest        = readings[0];
  const currentGlucose = latest?.glucose ?? null;
  const latestHR      = latest?.heartRate ?? null;
  const latestTemp    = latest?.temperature ?? null;

  // Build chart data filtered to selected time range
  const chartData = useMemo(() => {
    const selected = CHART_RANGES.find(r => r.key === chartRange);
    const latestTs = latest?.timestamp ?? null;
    const cutoff   = (selected?.ms && latestTs) ? latestTs - selected.ms : null;

    return [...readings]
      .filter(r => cutoff === null || r.timestamp >= cutoff)
      .map(r => ({ time: formatTime(r.timestamp), glucose: r.glucose, mealContext: r.mealContext, ts: r.timestamp }))
      .sort((a, b) => a.ts - b.ts);
  }, [readings, chartRange, latest]);

  const displayName = user?.name || `Patient ${patientId}`;
  const lastUpdatedLabel = latest ? timeAgo(latest.timestamp) : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">Real-time glucose monitoring · {displayName}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdatedLabel && (
            <span className="text-xs text-gray-500">{lastUpdatedLabel}</span>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full">
            <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="demo-banner animate-fade-in">
          <span>🔌</span>
          <span>
            <strong>Demo Mode</strong> — Firebase unavailable. Showing sample data.
            Real patient data will appear once reconnected.
          </span>
        </div>
      )}

      {/* Firebase error (non-demo mode) */}
      {error && !isDemoMode && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-xl text-red-400 text-sm">
          <span>⚠️</span> Firebase error: {error}
        </div>
      )}

      {/* Alert banner */}
      {!predLoading && <AlertBanner alerts={alerts} />}

      {/* Glucose cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map(i => <div key={i} className="card h-36 animate-pulse bg-gray-800/50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlucoseCard
            value={currentGlucose}
            label="Current Glucose"
            timestamp={latest?.timestamp}
            trend={trend}
          />
          <GlucoseCard
            value={predicted30min}
            label="Predicted (30 min)"
            mode={predMode}
            isPrediction
            predTimestamp={latest?.timestamp ? latest.timestamp + 30 * 60 * 1000 : null}
          />
        </div>
      )}

      {/* Vitals */}
      <div className="grid grid-cols-2 gap-4">
        <VitalCard icon="❤️" label="Heart Rate"   value={latestHR   ? Math.round(latestHR)        : null} unit="bpm" sub="Latest reading" />
        <VitalCard icon="🌡️" label="Temperature" value={latestTemp  ? latestTemp.toFixed(1)        : null} unit="°C"  sub="Body temperature" />
      </div>

      {/* 24hr Chart with range selector */}
      <div className="card">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
            Glucose Trend
            <span className="ml-1 text-xs text-gray-500">{chartData.length} readings</span>
          </h3>
          {/* Time range tabs */}
          <div className="flex gap-1 bg-gray-800/60 rounded-lg p-0.5">
            {CHART_RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setChartRange(r.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200 ${
                  chartRange === r.key
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-48 bg-gray-800/50 rounded-xl animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
            <span className="text-3xl">📉</span>
            No readings in this time window
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[40, 400]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={70}  stroke="#DC2626" strokeDasharray="4 4" strokeOpacity={0.6} />
              <ReferenceLine y={180} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.6} />
              <Line
                type="monotone"
                dataKey="glucose"
                stroke="#0097A7"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#0097A7', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block bg-danger/60" /> Low (&lt;70)</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block bg-primary" /> Trend</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block bg-warning/60" /> High (&gt;180)</span>
        </div>
      </div>

      {/* LSTM progress / active badge */}
      {!loading && readingsNeeded > 0 && (
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-amber-500 inline-block" />
              <h3 className="text-sm font-semibold text-gray-300">
                🧠 LSTM Prediction Progress
              </h3>
            </div>
            <span className="text-xs text-gray-500">{readings.length}/{LSTM_MIN}</span>
          </div>
          <p className="text-sm text-gray-400 mb-3">
            You have <span className="font-bold text-white">{readings.length}</span> readings.
            Need <span className="font-bold text-amber-400">{readingsNeeded} more</span> to activate LSTM predictions.
          </p>
          <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-cyan-500 transition-all duration-700"
              style={{ width: `${Math.round((readings.length / LSTM_MIN) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Using <span className="text-amber-400 font-medium">Fallback (linear trend)</span> until {LSTM_MIN} readings are reached
          </p>
        </div>
      )}
      {!loading && readingsNeeded === 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl animate-fade-in">
          <span>🧠</span>
          <span className="text-xs text-cyan-400 font-medium">
            LSTM predictions active — {readings.length} readings available
          </span>
        </div>
      )}

      {/* TIR Stats */}
      <TIRStats readings={readings} />

      {/* System Flow Banner */}
      <SystemFlowBanner predMode={predMode} readingsNeeded={readingsNeeded} />
    </div>
  );
}
