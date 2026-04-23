import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAllReadings } from '../hooks/usePatientData';
import { getGlucoseStatus, exportCSV } from '../utils/glucose';

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

function GlucoseBadge({ value }) {
  const status = getGlucoseStatus(value);
  const map = {
    'critical-low': 'badge-critical',
    'low': 'badge-warning',
    'normal': 'badge-normal',
    'high': 'badge-warning',
    'critical-high': 'badge-critical',
  };
  const labels = {
    'critical-low': '🔴 Crit Low',
    'low': '🟠 Low',
    'normal': '🟢 Normal',
    'high': '🟡 High',
    'critical-high': '🔴 Crit High',
  };
  return <span className={map[status] || 'badge-normal'}>{labels[status] || '—'}</span>;
}

export default function History() {
  const { activePatientId } = useAuth();
  const patientId = activePatientId || 'U001';
  const [selectedPatient, setSelectedPatient] = useState(patientId);
  const [sortDesc, setSortDesc] = useState(true);
  const [glucoseFilter, setGlucoseFilter] = useState('all');
  // Default: empty = no date restriction (show ALL readings)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { readings, loading } = useAllReadings(selectedPatient);

  const filtered = useMemo(() => {
    let data = [...readings];
    if (glucoseFilter === 'low') data = data.filter(r => r.glucose < 70);
    else if (glucoseFilter === 'normal') data = data.filter(r => r.glucose >= 70 && r.glucose <= 180);
    else if (glucoseFilter === 'high') data = data.filter(r => r.glucose > 180);
    if (dateFrom) {
      const fromTs = new Date(dateFrom + 'T00:00:00').getTime();
      data = data.filter(r => Number(r.timestamp) >= fromTs);
    }
    if (dateTo) {
      const toTs = new Date(dateTo + 'T23:59:59').getTime();
      data = data.filter(r => Number(r.timestamp) <= toTs);
    }
    if (sortDesc) data.sort((a, b) => b.timestamp - a.timestamp);
    else data.sort((a, b) => a.timestamp - b.timestamp);
    return data;
  }, [readings, glucoseFilter, dateFrom, dateTo, sortDesc]);

  const clearFilters = () => {
    setGlucoseFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const filterResultMsg = (() => {
    const total = readings.length;
    const shown = filtered.length;
    if (!dateFrom && !dateTo && glucoseFilter === 'all') return `${shown} total readings`;
    const fmtDate = (s) => new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const range = (dateFrom && dateTo) ? `${fmtDate(dateFrom + 'T00:00:00')} – ${fmtDate(dateTo + 'T00:00:00')}` : '';
    return `${shown} of ${total} readings${range ? ` · ${range}` : ''}`;
  })();

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const handleExport = () => {
    exportCSV(filtered.map(r => ({
      timestamp: formatDateTime(r.timestamp),
      glucose: r.glucose,
      heartRate: r.heartRate || '',
      temperature: r.temperature || '',
      mealContext: r.mealContext || '',
      entryType: r.entryType || 'device',
    })), `${selectedPatient}_readings.csv`);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Reading History</h1>
          <p className="text-gray-400 text-sm mt-0.5">{filterResultMsg}</p>
        </div>
        <button onClick={handleExport} className="btn-primary flex items-center gap-2 w-fit">
          <span>⬇️</span> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <span>🔍</span> Filters
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Patient</label>
            <select value={selectedPatient} onChange={e => { setSelectedPatient(e.target.value); setPage(1); }} className="input-field text-sm">
              <option value={patientId}>{patientId}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Glucose Range</label>
            <select value={glucoseFilter} onChange={e => { setGlucoseFilter(e.target.value); setPage(1); }} className="input-field text-sm">
              <option value="all">All Ranges</option>
              <option value="low">Low (&lt;70)</option>
              <option value="normal">Normal (70–180)</option>
              <option value="high">High (&gt;180)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">From Date</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="input-field text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">To Date</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="input-field text-sm" />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={clearFilters}
            className="text-xs text-gray-400 hover:text-primary transition-colors flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 border border-gray-700 rounded-lg"
          >
            ✕ Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                <th className="text-left px-5 py-3.5 text-gray-400 font-semibold">
                  <button
                    onClick={() => { setSortDesc(d => !d); setPage(1); }}
                    className="flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap"
                  >
                    {sortDesc ? '⬇ Newest First' : '⬆ Oldest First'}
                  </button>
                </th>
                <th className="text-left px-5 py-3.5 text-gray-400 font-semibold">Glucose (mg/dL)</th>
                <th className="text-left px-5 py-3.5 text-gray-400 font-semibold">Status</th>
                <th className="text-left px-5 py-3.5 text-gray-400 font-semibold">Heart Rate</th>
                <th className="text-left px-5 py-3.5 text-gray-400 font-semibold">Temp (°C)</th>
                <th className="text-left px-5 py-3.5 text-gray-400 font-semibold">Meal / Type</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 bg-gray-800 rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-500">
                    No readings found for current filters
                  </td>
                </tr>
              ) : paginated.map(r => (
                <tr key={r.id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3.5 text-gray-300 text-xs whitespace-nowrap">
                    {formatDateTime(r.timestamp)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-bold text-white">{r.glucose ? Math.round(r.glucose) : '—'}</span>
                  </td>
                  <td className="px-5 py-3.5"><GlucoseBadge value={r.glucose} /></td>
                  <td className="px-5 py-3.5 text-gray-300">{r.heartRate ? `${Math.round(r.heartRate)} bpm` : '—'}</td>
                  <td className="px-5 py-3.5 text-gray-300">{r.temperature ? r.temperature.toFixed(1) : '—'}</td>
                  <td className="px-5 py-3.5 text-xs">
                    {r.mealContext ? <span className="text-gray-300">{r.mealContext}</span> : null}
                    {r.entryType === 'manual' && <span className="ml-1.5 text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full text-[10px]">Manual</span>}
                    {!r.mealContext && r.entryType !== 'manual' && <span className="text-gray-600">Device</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800">
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
              >← Prev</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
