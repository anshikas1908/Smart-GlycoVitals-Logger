import { useState, useMemo, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ComposedChart, Line, Area,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useAllReadings } from '../hooks/usePatientData';
import { calculateTIR, getGlucoseColor } from '../utils/glucose';
import { fetchRecentPredictions } from '../services/glucoseService';

const COLORS = { below: '#DC2626', inRange: '#16A34A', above: '#F59E0B' };

function groupByDay(readings) {
  const map = {};
  readings.forEach(r => {
    const d   = new Date(r.timestamp);
    const key = d.toISOString().slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(r.glucose);
  });
  return Object.entries(map).map(([isoDate, vals]) => ({
    isoDate,
    date:     new Date(`${isoDate}T00:00:00`).toLocaleString('en-IN', { month: 'short', day: '2-digit' }),
    avg:      vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
    min:      vals.length > 0 ? Math.round(Math.min(...vals)) : 0,
    max:      vals.length > 0 ? Math.round(Math.max(...vals)) : 0,
    count:    vals.length,
    abnormal: vals.filter(v => v < 70 || v > 180).length,
  })).sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

function formatRangeLabel(startTs, endTs) {
  if (!startTs || !endTs) return '—';
  const start = new Date(startTs).toLocaleString('en-IN', { month: 'short', day: 'numeric' });
  const end   = new Date(endTs).toLocaleString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
}

const PERIODS = [
  { key: '7d',  label: '7 Days',  days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: 'all', label: 'All Time', days: null },
];

const CustomPieLegend = ({ payload }) => (
  <div className="flex gap-4 justify-center text-xs mt-2">
    {payload.map(e => (
      <span key={e.value} className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: e.color }} />
        {e.value}
      </span>
    ))}
  </div>
);

const ChartTooltipStyle = {
  contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: '12px' },
};

// ── Model accuracy helper ─────────────────────────────────────────────────────
function computeModelAccuracy(predictions) {
  if (!predictions || predictions.length === 0) return null;
  const withRmse = predictions.filter(p => p.modelRMSE);
  if (withRmse.length === 0) return null;
  const rmse = withRmse[withRmse.length - 1].modelRMSE;
  const lstmCount = predictions.filter(p => p.predictionMode === 'lstm').length;
  const fallbackCount = predictions.length - lstmCount;
  return { rmse, lstmCount, fallbackCount, total: predictions.length };
}

export default function Analytics() {
  const { activePatientId } = useAuth();
  const patientId = activePatientId || 'U001';
  const [timePeriod, setTimePeriod] = useState('all');
  const { readings, loading, isDemoMode } = useAllReadings(patientId);

  // Fetch historical predictions for Actual vs Predicted chart
  const [predictions, setPredictions] = useState([]);
  const [predLoading, setPredLoading] = useState(true);
  useEffect(() => {
    setPredLoading(true);
    fetchRecentPredictions(patientId, 100)
      .then(p => { setPredictions(p); setPredLoading(false); })
      .catch(() => { setPredictions([]); setPredLoading(false); });
  }, [patientId]);

  const sortedReadings = useMemo(
    () => [...readings].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)),
    [readings]
  );
  const latestReadingTs = sortedReadings[0]?.timestamp || null;

  // Time window
  const chartWindow = useMemo(() => {
    if (!latestReadingTs) return { startMs: null, endMs: null };
    const latestDate = new Date(latestReadingTs);
    latestDate.setHours(23, 59, 59, 999);
    const endMs  = latestDate.getTime();
    const period = PERIODS.find(p => p.key === timePeriod);
    if (!period || period.days === null) return { startMs: null, endMs };
    const start = new Date(endMs);
    start.setDate(start.getDate() - (period.days - 1));
    start.setHours(0, 0, 0, 0);
    return { startMs: start.getTime(), endMs };
  }, [latestReadingTs, timePeriod]);

  const chartReadings = useMemo(() => {
    if (!chartWindow.endMs) return sortedReadings;
    if (!chartWindow.startMs) return sortedReadings.filter(r => r.timestamp <= chartWindow.endMs);
    return sortedReadings.filter(r => r.timestamp >= chartWindow.startMs && r.timestamp <= chartWindow.endMs);
  }, [sortedReadings, chartWindow]);

  const stats     = useMemo(() => calculateTIR(chartReadings), [chartReadings]);
  const dailyData = useMemo(() => groupByDay(chartReadings),   [chartReadings]);

  const rangeLabel = useMemo(
    () => chartWindow.startMs
      ? formatRangeLabel(chartWindow.startMs, chartWindow.endMs)
      : latestReadingTs
        ? `All time · up to ${new Date(latestReadingTs).toLocaleString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : '—',
    [chartWindow, latestReadingTs]
  );

  const pieData = [
    { name: 'Below Range', value: stats.below, color: COLORS.below },
    { name: 'In Range',    value: stats.tir,   color: COLORS.inRange },
    { name: 'Above Range', value: stats.above,  color: COLORS.above },
  ].filter(d => d.value > 0);

  // Actual vs Predicted — formatted for chart
  const actualVsPredicted = useMemo(() => {
    if (predictions.length === 0) return [];
    return predictions.slice(-30).map(p => ({
      time:      new Date(p.timestamp).toLocaleString('en-IN', {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }),
      actual:    p.currentGlucose ? Math.round(p.currentGlucose) : null,
      predicted: p.predicted30min ? Math.round(p.predicted30min) : null,
      mode:      p.predictionMode || 'lstm',
    }));
  }, [predictions]);

  // Abnormal days
  const abnormalDays = useMemo(
    () => dailyData.filter(d => d.count >= 3 && (d.abnormal / d.count) > 0.5),
    [dailyData]
  );

  const bestDay  = dailyData.reduce((best,  d) => (!best  || d.avg < best.avg)  ? d : best, null);
  const worstDay = dailyData.reduce((worst, d) => (!worst || d.avg > worst.avg) ? d : worst, null);

  // Average readings/day
  const avgPerDay = useMemo(() => {
    if (dailyData.length === 0) return 0;
    const total = dailyData.reduce((sum, d) => sum + d.count, 0);
    return (total / dailyData.length).toFixed(1);
  }, [dailyData]);

  const modelAccuracy = useMemo(() => computeModelAccuracy(predictions), [predictions]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-gray-400 text-sm mt-0.5">Glucose patterns and trends</p>
          <p className="text-xs text-gray-500 mt-1">📅 {rangeLabel} · {chartReadings.length} readings</p>
        </div>
        {/* Period filter */}
        <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setTimePeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                timePeriod === p.key
                  ? 'bg-primary text-white shadow-md shadow-primary/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Demo badge */}
      {isDemoMode && (
        <div className="demo-banner">
          <span>🔌</span>
          <span><strong>Demo Mode</strong> — Showing sample analytics data</span>
        </div>
      )}

      {/* TIR + Daily bar grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* TIR Pie */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
            Time-in-Range Distribution
          </h3>
          <p className="text-xs text-gray-500 mb-4 pl-3">{chartReadings.length} readings · {PERIODS.find(p => p.key === timePeriod)?.label}</p>
          {loading ? (
            <div className="h-56 bg-gray-800/50 rounded-xl animate-pulse" />
          ) : pieData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.85} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} {...ChartTooltipStyle} />
                <Legend
                  content={<CustomPieLegend />}
                  payload={pieData.map(d => ({ value: d.name, color: d.color }))}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="text-center mt-2">
            <div className="text-3xl font-bold text-green-400">{stats.tir}%</div>
            <div className="text-xs text-gray-400">Time in Range (70–180 mg/dL)</div>
          </div>
        </div>

        {/* Daily avg bar */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
            Daily Average Glucose
          </h3>
          <p className="text-xs text-gray-500 mb-4 pl-3">mg/dL per day</p>
          {loading ? (
            <div className="h-56 bg-gray-800/50 rounded-xl animate-pulse" />
          ) : dailyData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis domain={[50, 300]} tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip {...ChartTooltipStyle} formatter={(v, n) => [`${v} mg/dL`, n]} />
                <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                  {dailyData.map((d, i) => <Cell key={i} fill={getGlucoseColor(d.avg)} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Actual vs Predicted comparison chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-cyan-400 inline-block" />
          Actual vs Predicted (30-min ahead)
        </h3>
        {predLoading ? (
          <div className="h-48 bg-gray-800/50 rounded-xl animate-pulse mt-3" />
        ) : actualVsPredicted.length === 0 ? (
          <div className="mt-3 h-48 flex flex-col items-center justify-center gap-3 border border-dashed border-gray-700 rounded-xl">
            <span className="text-3xl">🤖</span>
            <div className="text-center">
              <p className="text-gray-400 text-sm font-medium">No LSTM predictions yet</p>
              <p className="text-gray-600 text-xs mt-1">
                Run <code className="bg-gray-800 px-1 rounded text-gray-400">python scripts/push_predictions.py</code> to generate predictions
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4 pl-3">
              {predictions.filter(p => p.predictionMode === 'lstm').length} LSTM · {predictions.filter(p => p.predictionMode === 'fallback').length} Fallback · {actualVsPredicted.length} shown
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={actualVsPredicted} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis domain={[40, 400]} tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip {...ChartTooltipStyle} formatter={(v, n) => [`${v} mg/dL`, n]} />
                <Legend
                  formatter={(v) => v === 'actual' ? 'Actual Glucose' : 'LSTM Predicted'}
                  wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
                />
                <Area type="monotone" dataKey="actual"    fill="#0097A720" stroke="#0097A7" strokeWidth={2} dot={false} name="actual" />
                <Line  type="monotone" dataKey="predicted" stroke="#A78BFA" strokeWidth={2} strokeDasharray="5 3" dot={false} name="predicted" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-primary inline-block" /> Actual</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-purple-400 inline-block" style={{ borderTop: '2px dashed #A78BFA' }} /> Predicted</span>
            </div>
          </>
        )}
      </div>

      {/* Model Accuracy card — only when predictions exist */}
      {modelAccuracy && (
        <div className="card border border-cyan-500/20 bg-cyan-500/5">
          <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
            <span>🧠</span> Model Accuracy
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-gray-800/60 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">±{modelAccuracy.rmse}</div>
              <div className="text-xs text-gray-400 mt-1">RMSE (mg/dL)</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{modelAccuracy.lstmCount}</div>
              <div className="text-xs text-gray-400 mt-1">LSTM Predictions</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-amber-400">{modelAccuracy.fallbackCount}</div>
              <div className="text-xs text-gray-400 mt-1">Fallback Predictions</div>
            </div>
          </div>
        </div>
      )}

      {/* Abnormal Pattern warning */}
      {abnormalDays.length > 0 && (
        <div className="card border border-warning/30 bg-warning/5">
          <h3 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
            <span>⚠️</span> Abnormal Patterns Detected
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            These days had more than 50% of readings outside the 70–180 mg/dL range:
          </p>
          <div className="flex flex-wrap gap-2">
            {abnormalDays.map(d => (
              <div key={d.isoDate} className="px-3 py-1.5 rounded-lg bg-warning/15 text-xs font-semibold text-yellow-300">
                {d.date} · avg {d.avg} mg/dL · {d.abnormal}/{d.count} abnormal
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best / Worst day */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="card border-success/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center text-xl">🏆</div>
            <div>
              <div className="font-semibold text-white">Best Day</div>
              <div className="text-xs text-gray-400">Lowest average glucose</div>
            </div>
          </div>
          {bestDay ? (
            <>
              <div className="text-3xl font-bold text-green-400">{bestDay.avg} <span className="text-base text-gray-400 font-normal">mg/dL</span></div>
              <div className="text-sm text-gray-400 mt-1">{bestDay.date} · {bestDay.count} readings</div>
              <div className="text-xs text-gray-500 mt-1">Range: {bestDay.min}–{bestDay.max} mg/dL</div>
            </>
          ) : <div className="text-gray-500 text-sm">No data</div>}
        </div>

        <div className="card border-danger/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-danger/15 flex items-center justify-center text-xl">📉</div>
            <div>
              <div className="font-semibold text-white">Worst Day</div>
              <div className="text-xs text-gray-400">Highest average glucose</div>
            </div>
          </div>
          {worstDay ? (
            <>
              <div className="text-3xl font-bold text-red-400">{worstDay.avg} <span className="text-base text-gray-400 font-normal">mg/dL</span></div>
              <div className="text-sm text-gray-400 mt-1">{worstDay.date} · {worstDay.count} readings</div>
              <div className="text-xs text-gray-500 mt-1">Range: {worstDay.min}–{worstDay.max} mg/dL</div>
            </>
          ) : <div className="text-gray-500 text-sm">No data</div>}
        </div>
      </div>

      {/* Summary statistics */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
          Summary Statistics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Average Glucose',  value: `${stats.avg} mg/dL`, color: '#0097A7' },
            { label: 'GMI (Est. HbA1c)', value: `${stats.gmi}%`,      color: '#A78BFA' },
            { label: 'CV (Variability)', value: `${stats.cv}%`,        color: stats.cv < 36 ? '#16A34A' : '#F59E0B' },
            { label: 'Avg Readings/Day', value: avgPerDay,             color: '#6B7280' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
