import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PinInput({ value, onChange }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      maxLength={4}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      placeholder="Enter PIN"
      autoComplete="new-password"
      className="input-field text-center text-xl font-mono tracking-widest"
    />
  );
}

export default function DoctorLogin() {
  const { loginDoctor, authError, authLoading, clearError } = useAuth();
  const navigate = useNavigate();
  const [docId, setDocId] = useState('');
  const [docPin, setDocPin] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await loginDoctor(docId, docPin);
    if (ok) navigate('/doctor');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-1/4 right-1/3 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-purple-500/15 border border-purple-500/30 mb-4 shadow-xl shadow-purple-900/20">
            <span className="text-4xl">🩺</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Doctor <span className="text-purple-400">Portal</span></h1>
          <p className="text-gray-400 mt-1 text-sm">Smart GlycoVitals Logger</p>
        </div>

        <div className="card border-purple-500/20 shadow-2xl shadow-black/40 animate-fade-in">
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-5 rounded-full bg-purple-500" />
              <h2 className="text-xl font-semibold text-white">Doctor Login</h2>
            </div>
            <p className="text-gray-400 text-sm pl-3.5">Authorized medical staff only</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Doctor ID</label>
              <input
                type="text"
                value={docId}
                onChange={e => { setDocId(e.target.value.toUpperCase()); clearError(); }}
                autoComplete="off"
                placeholder="Enter Doctor ID"
                className="input-field font-mono tracking-wider"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">PIN</label>
              <PinInput value={docPin} onChange={v => { setDocPin(v); clearError(); }} />
            </div>

            {authError && (
              <div className="flex items-center gap-2.5 p-3 bg-danger/10 border border-danger/30 rounded-lg text-red-400 text-sm animate-fade-in">
                <span>⚠️</span> {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || docId.length < 3 || docPin.length !== 4}
              className="w-full py-3 flex items-center justify-center gap-2 font-semibold text-white rounded-xl transition-all duration-200 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 shadow-lg shadow-purple-900/30"
            >
              {authLoading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Verifying...</span></>
              ) : '👨‍⚕️ Access Doctor Portal'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-800 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 bg-purple-500/5 border border-purple-500/10 rounded-lg py-2">
              🔒 Restricted to authorized medical personnel only
            </div>
            <a href="/login" className="block text-sm text-gray-400 hover:text-primary transition-colors">
              ← Back to Patient Login
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Smart GlycoVitals Logger © 2025 · ADA-Compliant Platform
        </p>
      </div>
    </div>
  );
}
