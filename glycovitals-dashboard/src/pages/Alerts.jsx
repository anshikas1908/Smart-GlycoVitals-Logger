import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAllReadings } from '../hooks/usePatientData';

function deriveStatus(reading) {
  if (reading.status && reading.status !== 'Normal') return reading.status;
  const g = Number(reading.glucose);
  if (g > 300) return 'Crit High';
  if (g > 180) return 'High';
  if (g < 54)  return 'Crit Low';
  if (g < 70)  return 'Low';
  return 'Normal';
}

function getSeverity(status) {
  if (status === 'Crit High' || status === 'Crit Low') return 'critical';
  if (status === 'High' || status === 'Low')           return 'warning';
  return 'normal';
}

function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatTimeAgo(ts) {
  if (!ts) return null;
  const diff = Math.round((Date.now() - ts) / 60000);
  if (diff < 1)  return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

/** Compare the last two abnormal readings of same type to infer trend */
function getAlertTrend(reading, allAbnormal) {
  const sameType = allAbnormal.filter(
    r => r.id !== reading.id && deriveStatus(r) === reading.derivedStatus
  );
  if (sameType.length === 0) return null;
  const mostRecent = sameType[0]; // allAbnormal sorted newest-first
  const delta = reading.glucose - mostRecent.glucose;
  if (Math.abs(delta) < 5) return null;
  return delta > 0 ? '↑ Worsening' : '↓ Improving';
}

const SEVERITY_STYLES = {
  critical: {
    border: 'border-l-danger',
    icon: '🚨',
    iconBg: 'bg-danger/15',
    badge: 'badge-critical',
  },
  warning: {
    border: 'border-l-warning',
    icon: '⚠️',
    iconBg: 'bg-warning/15',
    badge: 'badge-warning',
  },
};

const FILTER_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning',  label: 'Warning' },
];

export default function Alerts() {
  const { user, activePatientId } = useAuth();
  const patientId = activePatientId || user?.patientId || 'U001';
  const { readings, loading, isDemoMode } = useAllReadings(patientId);

  const [activeFilter, setActiveFilter] = useState('all');

  const abnormalReadings = useMemo(() => {
    return readings
      .map(r => ({ ...r, derivedStatus: deriveStatus(r) }))
      .filter(r => r.derivedStatus !== 'Normal')
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [readings]);

  const counts = useMemo(() => ({
    critical: abnormalReadings.filter(r => getSeverity(r.derivedStatus) === 'critical').length,
    warning:  abnormalReadings.filter(r => getSeverity(r.derivedStatus) === 'warning').length,
    total:    abnormalReadings.length,
  }), [abnormalReadings]);

  const filteredReadings = useMemo(() => {
    if (activeFilter === 'all') return abnormalReadings;
    return abnormalReadings.filter(r => getSeverity(r.derivedStatus) === activeFilter);
  }, [abnormalReadings, activeFilter]);

  const lastChecked = readings.length > 0 ? formatTimeAgo(readings[0]?.timestamp) : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {loading
              ? 'Loading…'
              : `${counts.total} abnormal readings · ${counts.critical} critical · ${counts.warning} warning`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastChecked && (
            <span className="text-xs text-gray-500">checked {lastChecked}</span>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full">
            <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Demo badge */}
      {isDemoMode && (
        <div className="demo-banner">
          <span>🔌</span>
          <span><strong>Demo Mode</strong> — Showing sample alert data</span>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Critical', count: counts.critical, icon: '🚨', color: 'text-red-400',    bg: 'bg-danger/10 border-danger/20'   },
          { label: 'Warning',  count: counts.warning,  icon: '⚠️',  color: 'text-yellow-400', bg: 'bg-warning/10 border-warning/20' },
          { label: 'Total',    count: counts.total,    icon: '📋',  color: 'text-gray-300',   bg: 'bg-gray-800/60 border-gray-700'  },
        ].map(s => (
          <div key={s.label} className={`card border text-center ${s.bg}`}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`text-3xl font-bold ${s.color}`}>{loading ? '—' : s.count}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Severity filter tabs */}
      <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 w-fit">
        {FILTER_TABS.map(tab => {
          const count = tab.key === 'all' ? counts.total
            : tab.key === 'critical' ? counts.critical
            : counts.warning;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                activeFilter === tab.key
                  ? 'bg-primary text-white shadow-md shadow-primary/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
              {!loading && (
                <span className={`text-[10px] px-1.5 rounded-full font-bold ${
                  activeFilter === tab.key
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-gray-800/50" />
          ))
        ) : filteredReadings.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-3">{activeFilter === 'all' ? '✅' : '🔍'}</div>
            <div className="text-white font-semibold mb-1">
              {activeFilter === 'all' ? 'All Clear' : `No ${activeFilter} alerts`}
            </div>
            <div className="text-gray-400 text-sm">
              {activeFilter === 'all'
                ? 'All glucose values are within normal range.'
                : `No ${activeFilter} glucose readings found in your history.`}
            </div>
          </div>
        ) : (
          filteredReadings.map(r => {
            const severity  = getSeverity(r.derivedStatus);
            const style     = SEVERITY_STYLES[severity] || {};
            const trendLabel = getAlertTrend(r, abnormalReadings);

            return (
              <div
                key={r.id}
                className={`card border-l-4 flex items-start gap-4 animate-fade-in ${style.border}`}
              >
                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xl ${style.iconBg}`}>
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white leading-snug">
                      Glucose {r.derivedStatus} — {Math.round(r.glucose)} mg/dL
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {trendLabel && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          trendLabel.includes('Worsening')
                            ? 'bg-red-500/15 text-red-400'
                            : 'bg-green-500/15 text-green-400'
                        }`}>
                          {trendLabel}
                        </span>
                      )}
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${style.badge}`}>
                        {r.derivedStatus}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
                    <span>{formatDateTime(r.timestamp)}</span>
                    {r.mealContext && <span>· {r.mealContext}</span>}
                    {r.heartRate && (
                      <span>· HR: <span className="text-white font-medium">{Math.round(r.heartRate)} bpm</span></span>
                    )}
                    {r.notes && <span>· "{r.notes}"</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
