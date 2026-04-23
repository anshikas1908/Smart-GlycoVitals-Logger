// Glucose utility functions
// getTrend is in predictions.js — re-exported here for convenience
export { getTrend } from './predictions';

export function getGlucoseStatus(value) {
  if (value === null || value === undefined) return 'unknown';
  if (value < 54) return 'critical-low';
  if (value < 70) return 'low';
  if (value <= 180) return 'normal';
  if (value <= 250) return 'high';
  return 'critical-high';
}

export function getGlucoseColor(value) {
  const status = getGlucoseStatus(value);
  const colors = {
    'critical-low': '#EF4444',
    'low': '#F97316',
    'normal': '#22C55E',
    'high': '#F59E0B',
    'critical-high': '#DC2626',
    'unknown': '#6B7280',
  };
  return colors[status];
}

export function getGlucoseLabel(value) {
  const status = getGlucoseStatus(value);
  const labels = {
    'critical-low': 'Critical Low',
    'low': 'Low',
    'normal': 'In Range',
    'high': 'High',
    'critical-high': 'Critical High',
    'unknown': 'Unknown',
  };
  return labels[status];
}

export function calculateTIR(readings) {
  if (!readings.length) return { tir: 0, below: 0, above: 0, avg: 0, cv: 0, gmi: 0 };
  const values = readings.map(r => r.glucose).filter(Boolean);
  const total = values.length;
  if (!total) return { tir: 0, below: 0, above: 0, avg: 0, cv: 0, gmi: 0 };
  const inRange = values.filter(v => v >= 70 && v <= 180).length;
  const below = values.filter(v => v < 70).length;
  const above = values.filter(v => v > 180).length;
  const avg = values.reduce((a, b) => a + b, 0) / total;
  const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / total;
  const std = Math.sqrt(variance);
  const cv = (std / avg) * 100;
  const gmi = 3.31 + (0.02392 * avg);
  return {
    tir: Math.round((inRange / total) * 100),
    below: Math.round((below / total) * 100),
    above: Math.round((above / total) * 100),
    avg: Math.round(avg),
    cv: Math.round(cv),
    gmi: gmi.toFixed(1),
  };
}

export function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function exportCSV(data, filename = 'readings.csv') {
  if (!data.length) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).join(','));
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
