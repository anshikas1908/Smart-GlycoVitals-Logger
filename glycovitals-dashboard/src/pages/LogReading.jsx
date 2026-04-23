import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAllReadings } from '../hooks/usePatientData';
import { getGlucoseStatus } from '../utils/glucose';

const PAGE_SIZE = 5;

function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function glucoseColor(v) {
  if (!v || Number.isNaN(Number(v))) return '#6B7280';
  const n = Number(v);
  if (n < 70 || n > 180) return '#DC2626';
  if (n <= 140) return '#16A34A';
  return '#F59E0B';
}

function glucoseLabel(v) {
  if (!v || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (n < 70) return '🔴 Low';
  if (n <= 140) return '🟢 Normal';
  return '🟡 High';
}

function StatusBadge({ value }) {
  if (!value) return null;
  const status = getGlucoseStatus(Number(value));
  const map = {
    'critical-low': 'text-red-400',
    'low': 'text-red-400',
    'normal': 'text-green-400',
    'high': 'text-yellow-400',
    'critical-high': 'text-yellow-400',
  };
  return <span className={`text-xs font-semibold ${map[status] || 'text-gray-400'}`}>{glucoseLabel(value)}</span>;
}

function QuickStats({ readings }) {
  const [weekCutoff] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const todayCount = useMemo(
    () => readings.filter((r) => new Date(r.timestamp).toISOString().slice(0, 10) === todayKey).length,
    [readings, todayKey]
  );
  const weekCount = useMemo(
    () => readings.filter((r) => r.timestamp >= weekCutoff).length,
    [readings, weekCutoff]
  );
  const avg = useMemo(() => {
    const values = readings.map((r) => Number(r.glucose)).filter((v) => !Number.isNaN(v) && v > 0);
    if (!values.length) return '—';
    return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
  }, [readings]);

  const items = [
    { label: 'Today', value: todayCount, suffix: 'readings' },
    { label: 'This Week', value: weekCount, suffix: 'readings' },
    { label: 'Average', value: avg, suffix: 'mg/dL' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="card text-center py-4">
          <div className="text-xs uppercase tracking-wider text-gray-500">{item.label}</div>
          <div className="text-2xl font-bold text-white mt-1">{item.value}</div>
          <div className="text-xs text-gray-400 mt-0.5">{item.suffix}</div>
        </div>
      ))}
    </div>
  );
}

export default function LogReading() {
  const { activePatientId } = useAuth();
  const patientId = activePatientId || 'U001';
  const { readings, loading } = useAllReadings(patientId);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const latest = readings[0] || null;
  const visibleReadings = useMemo(() => readings.slice(0, visibleCount), [readings, visibleCount]);
  const hasMore = visibleCount < readings.length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">📝 Log Reading</h1>
        <p className="text-gray-400 text-sm mt-0.5">Live view of all your glucose readings</p>
      </div>

      {!loading && <QuickStats readings={readings} />}

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="text-xs tracking-wider font-semibold text-primary uppercase">Latest Reading</div>
          <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        </div>

        {loading ? (
          <div className="h-28 bg-gray-800/50 rounded-xl animate-pulse" />
        ) : latest ? (
          <div className="rounded-2xl border border-gray-700 bg-gray-900/70 p-5">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <div className="text-5xl font-black tracking-tight" style={{ color: glucoseColor(latest.glucose) }}>
                  {latest.glucose && !Number.isNaN(Number(latest.glucose)) ? Math.round(latest.glucose) : '—'}
                  <span className="text-base text-gray-400 font-semibold ml-2">mg/dL</span>
                </div>
                <div className="mt-1 text-sm font-semibold" style={{ color: glucoseColor(latest.glucose) }}>
                  {glucoseLabel(latest.glucose)}
                </div>
              </div>
              <div className="text-sm text-gray-300">
                <div><span className="text-gray-500">Meal:</span> {latest.mealContext || '—'}</div>
                <div><span className="text-gray-500">When:</span> {formatDateTime(latest.timestamp)}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-500">Heart Rate</div>
                <div className="text-white font-semibold">{latest.heartRate ? `${Math.round(latest.heartRate)} bpm` : '—'}</div>
              </div>
              <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-500">Temperature</div>
                <div className="text-white font-semibold">{latest.temperature ? `${Number(latest.temperature).toFixed(1)} °C` : '—'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">No readings yet. Use the floating ➕ button to add your first reading.</div>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">All Readings</h2>
          <span className="text-xs text-gray-500">Showing {Math.min(visibleReadings.length, readings.length)} of {readings.length} readings</span>
        </div>

        {loading ? (
          <div className="p-5 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-800/50 rounded-xl animate-pulse" />)}</div>
        ) : readings.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No readings found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/80">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Date &amp; Time</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Glucose</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Meal Context</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Heart Rate</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Temperature</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReadings.map((r) => (
                    <tr key={r.id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{formatDateTime(r.timestamp)}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: glucoseColor(r.glucose) }}>
                        {Math.round(r.glucose)} <span className="text-xs text-gray-500 font-normal">mg/dL</span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{r.mealContext || '—'}</td>
                      <td className="px-4 py-3 text-gray-300">{r.heartRate ? `${Math.round(r.heartRate)} bpm` : '—'}</td>
                      <td className="px-4 py-3 text-gray-300">{r.temperature ? `${Number(r.temperature).toFixed(1)} °C` : '—'}</td>
                      <td className="px-4 py-3"><StatusBadge value={r.glucose} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="px-5 py-4 border-t border-gray-800 text-center">
                <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="btn-secondary px-5 py-2 text-sm">
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
