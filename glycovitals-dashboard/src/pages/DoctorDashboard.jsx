import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { usePatientData } from '../hooks/usePatientData';
import { getGlucoseColor, getGlucoseLabel, getGlucoseStatus, calculateTIR, formatTime } from '../utils/glucose';
import AIAssistant from '../components/AIAssistant';

const ALL_PATIENTS = ['U001','U002','U003','U004','U005','U006','U007','U008','U009','U010'];

function PatientCard({ patientId, isSelected, onClick }) {
  const { readings, prediction } = usePatientData(patientId);
  const latest = readings[readings.length - 1];
  const glucose = latest?.glucose ?? prediction?.currentGlucose ?? null;
  const color = getGlucoseColor(glucose);
  const status = getGlucoseStatus(glucose);

  return (
    <button
      onClick={() => onClick(patientId)}
      className={`card text-left transition-all duration-200 hover:scale-105 cursor-pointer ${
        isSelected ? 'border-primary/60 shadow-primary/20 shadow-xl' : 'hover:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="font-bold text-white text-sm">{patientId}</span>
        {isSelected && <span className="text-xs text-primary font-semibold">● Selected</span>}
      </div>
      <div className="text-3xl font-black" style={{ color }}>
        {glucose ? Math.round(glucose) : '—'}
        <span className="text-xs text-gray-400 font-normal ml-1">mg/dL</span>
      </div>
      <div className={`text-xs mt-1.5 font-semibold ${
        status === 'normal' ? 'text-green-400' : status.includes('critical') ? 'text-red-400' : 'text-yellow-400'
      }`}>{getGlucoseLabel(glucose)}</div>
    </button>
  );
}

function ComparisonBar({ patientId }) {
  const { readings } = usePatientData(patientId);
  const latest = readings[readings.length - 1];
  const glucose = latest?.glucose ?? null;
  const pct = glucose ? Math.min(100, ((glucose - 40) / (400 - 40)) * 100) : 0;
  const color = getGlucoseColor(glucose);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-gray-400 w-10">{patientId}</span>
      <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-bold w-16 text-right" style={{ color }}>
        {glucose ? `${Math.round(glucose)} mg/dL` : '—'}
      </span>
    </div>
  );
}

function PatientDetail({ patientId }) {
  const { readings, prediction, loading } = usePatientData(patientId);
  const latest = readings[readings.length - 1];
  const glucose = latest?.glucose ?? prediction?.currentGlucose ?? null;
  const stats = calculateTIR(readings);
  const chartData = readings.map(r => ({ time: formatTime(r.timestamp), glucose: r.glucose }));

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Current Glucose', value: glucose ? `${Math.round(glucose)} mg/dL` : '—', color: getGlucoseColor(glucose) },
          { label: 'Predicted 30min', value: prediction?.predicted30min ? `${Math.round(prediction.predicted30min)} mg/dL` : '—', color: '#0097A7' },
          { label: 'TIR', value: `${stats.tir}%`, color: stats.tir >= 70 ? '#16A34A' : '#DC2626' },
          { label: 'Avg Glucose', value: `${stats.avg} mg/dL`, color: '#9CA3AF' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
          24-Hour Trend — {patientId}
        </h3>
        {loading ? <div className="h-40 bg-gray-800/50 rounded-xl animate-pulse" /> : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[40, 400]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px' }} />
              <Line type="monotone" dataKey="glucose" stroke="#0097A7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Alerts */}
      {prediction?.alerts?.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-warning/10 border border-warning/30 rounded-xl">
          <span className="text-lg">⚠️</span>
          <div>
            <div className="font-semibold text-yellow-400 text-sm">Active Alerts</div>
            <div className="text-xs text-gray-300 mt-0.5">{prediction.alerts.join(' · ')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorDashboard() {
  const { user, logout, setDoctorPatient } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('overview'); // 'overview' | 'detail' | 'compare'
  const selected = user?.selectedPatient || 'U001';

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-gray-900/80 backdrop-blur border-b border-gray-800 px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-lg">💉</div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">Smart GlycoVitals</div>
            <div className="text-xs text-primary">Logger</div>
          </div>
        </div>

        {/* Doctor badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/15 border border-purple-500/30 rounded-xl">
          <span className="text-sm">👨‍⚕️</span>
          <div>
            <div className="text-xs font-bold text-purple-300">{user?.doctorId}</div>
            <div className="text-[10px] text-purple-400">{user?.name}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="hidden sm:flex bg-gray-800 rounded-lg p-1 gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: '🏠' },
              { id: 'detail', label: 'Detail', icon: '📊' },
              { id: 'compare', label: 'Compare', icon: '⚖️' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${view === v.id ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <button onClick={handleLogout} className="btn-secondary text-sm px-3 py-1.5 text-red-400">Logout</button>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        {/* Overview */}
        {view === 'overview' && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-white">All Patients Overview</h1>
              <span className="text-xs text-gray-400">Click a patient to view details</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ALL_PATIENTS.map(pid => (
                <PatientCard
                  key={pid}
                  patientId={pid}
                  isSelected={selected === pid}
                  onClick={(p) => { setDoctorPatient(p); setView('detail'); }}
                />
              ))}
            </div>
            <PatientDetail patientId={selected} />
          </>
        )}

        {/* Detail view */}
        {view === 'detail' && (
          <>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">Patient Detail</h1>
              <select
                value={selected}
                onChange={e => setDoctorPatient(e.target.value)}
                className="input-field w-auto text-sm ml-auto"
              >
                {ALL_PATIENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <PatientDetail patientId={selected} />
          </>
        )}

        {/* Comparison view */}
        {view === 'compare' && (
          <>
            <h1 className="text-xl font-bold text-white">Glucose Comparison — All Patients</h1>
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-300 mb-5 flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
                Current Glucose Levels (40–400 mg/dL range)
              </h3>
              <div className="space-y-3">
                {ALL_PATIENTS.map(pid => (
                  <ComparisonBar key={pid} patientId={pid} />
                ))}
              </div>
              <div className="flex gap-4 mt-4 text-xs text-gray-500 border-t border-gray-800 pt-4">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded inline-block bg-success/70" /> Normal (70–180)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded inline-block bg-warning/70" /> High (&gt;180)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded inline-block bg-danger/70" /> Low or Critical</span>
              </div>
            </div>
          </>
        )}
      </main>

      <AIAssistant patientId={selected} />
    </div>
  );
}
