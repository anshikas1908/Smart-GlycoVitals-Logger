import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

function PinInput({ value, onChange, placeholder = 'Enter PIN' }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      maxLength={4}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      placeholder={placeholder}
      autoComplete="new-password"
      className="input-field text-center text-xl font-mono tracking-widest"
    />
  );
}

function ForgotModal({ mode, onClose }) {
  // mode: 'id' | 'pin'
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);       // { found, patientId?, pinReset?, error? }
  const [foundId, setFoundId] = useState(null);     // set after step-1 account lookup
  // Step 2 – PIN fields
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  // Step 1 – find account by email / phone
  const handleSearch = async () => {
    if (!contact.trim()) return;
    setLoading(true);
    setResult(null);
    setFoundId(null);
    try {
      const snap = await get(ref(db, 'users'));
      if (!snap.exists()) { setResult({ found: false }); setLoading(false); return; }
      const users = snap.val();
      let id = null;
      for (const [uid, data] of Object.entries(users)) {
        const profile = data.profile || data;
        const email = (profile.email || '').toLowerCase();
        const phone = String(profile.phone || '');
        const q = contact.trim().toLowerCase();
        if (email === q || phone === q) { id = uid; break; }
      }
      if (!id) {
        setResult({ found: false });
      } else if (mode === 'id') {
        setResult({ found: true, patientId: id });
      } else {
        // PIN mode – advance to Step 2 so user can choose their PIN
        setFoundId(id);
      }
    } catch {
      setResult({ found: false, error: true });
    }
    setLoading(false);
  };

  // Step 2 – save user-chosen PIN to Firebase
  const handleSavePin = async () => {
    setPinError('');
    if (newPin.length !== 4) { setPinError('PIN must be exactly 4 digits.'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match. Please try again.'); return; }
    setPinSaving(true);
    try {
      const { update: fbUpdate } = await import('firebase/database');
      await fbUpdate(ref(db, `users/${foundId}`), { pin: newPin });
      setResult({ found: true, patientId: foundId, pinReset: true });
    } catch {
      setPinError('Failed to save PIN. Please try again.');
    }
    setPinSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white text-lg">
            {mode === 'id' ? '🔍 Find Patient ID' : '🔑 Reset PIN'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* ── Final result screen ── */}
        {result ? (
          result.found ? (
            <div className="text-center">
              <div className="text-4xl mb-3">{result.pinReset ? '🔓' : '✅'}</div>
              {result.pinReset ? (
                <>
                  <p className="text-green-400 font-semibold mb-2">PIN updated! Login with your new PIN ✅</p>
                  <p className="text-gray-300 text-sm">
                    Your Patient ID is <span className="font-bold text-primary">{result.patientId}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-green-400 font-semibold mb-2">Account Found!</p>
                  <p className="text-gray-300 text-sm">Your Patient ID is:</p>
                  <div className="text-4xl font-black text-primary my-3">{result.patientId}</div>
                  <p className="text-gray-500 text-xs">⚠️ Please save this somewhere safe!</p>
                </>
              )}
              <button onClick={onClose} className="btn-primary w-full py-2.5 mt-4">Done</button>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl mb-3">❌</div>
              <p className="text-red-400 font-semibold mb-2">{result.error ? 'Connection error.' : 'No account found.'}</p>
              <p className="text-gray-400 text-sm">Please check your details or register first.</p>
              <button onClick={() => setResult(null)} className="btn-secondary w-full py-2.5 mt-4">Try Again</button>
            </div>
          )

        /* ── Step 2: PIN mode – set new PIN ── */
        ) : foundId ? (
          <>
            <p className="text-gray-400 text-sm mb-1">Account found: <span className="text-primary font-semibold">{foundId}</span></p>
            <p className="text-gray-500 text-xs mb-4">Choose a new 4-digit PIN.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">New PIN</label>
                <PinInput value={newPin} onChange={setNewPin} placeholder="New PIN" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Confirm PIN</label>
                <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="Confirm PIN" />
              </div>
              {pinError && (
                <p className="text-red-400 text-xs flex items-center gap-1"><span>⚠️</span> {pinError}</p>
              )}
              <button
                onClick={handleSavePin}
                disabled={pinSaving || newPin.length !== 4 || confirmPin.length !== 4}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {pinSaving
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Saving...</span></>
                  : '🔐 Save New PIN'}
              </button>
            </div>
          </>

        /* ── Step 1: find account ── */
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-4">
              Enter your registered email or phone number.
            </p>
            <input
              type="text"
              value={contact}
              onChange={e => setContact(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Email or phone number"
              className="input-field mb-4"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !contact.trim()}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Searching...</span></>
                : 'Search →'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  const { loginPatient, authError, authLoading, clearError } = useAuth();
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [pin, setPin] = useState('');
  const [forgotMode, setForgotMode] = useState(null); // 'id' | 'pin' | null

  const openForgot = (mode) => { clearError(); setForgotMode(mode); };

  const handlePatientLogin = async (e) => {
    e.preventDefault();
    const ok = await loginPatient(patientId, pin);
    if (ok) navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(rgba(0,151,167,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,151,167,0.3) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/15 border border-primary/30 mb-4 shadow-xl shadow-primary/10">
            <span className="text-4xl">💉</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Smart <span className="text-primary">GlycoVitals</span></h1>
          <p className="text-gray-400 mt-1 text-sm">Medical IoT Monitoring System</p>
        </div>

        {/* Patient Login Card */}
        <div className="card border-gray-800/50 shadow-2xl shadow-black/40 animate-fade-in">
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-5 rounded-full bg-primary" />
              <h2 className="text-xl font-semibold text-white">Patient Login</h2>
            </div>
            <p className="text-gray-400 text-sm pl-3.5">Enter your Patient ID and PIN to continue</p>
          </div>

          <form onSubmit={handlePatientLogin} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Patient ID</label>
              <input
                type="text"
                value={patientId}
                onChange={e => setPatientId(e.target.value.toUpperCase())}
                autoComplete="off"
                placeholder="Enter Patient ID"
                className="input-field font-mono tracking-wider"
                maxLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">4-Digit PIN</label>
              <PinInput value={pin} onChange={setPin} />
            </div>

            {authError && (
              <div className="flex items-center gap-2.5 p-3 bg-danger/10 border border-danger/30 rounded-lg text-red-400 text-sm animate-fade-in">
                <span>⚠️</span> {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || patientId.length < 2 || pin.length !== 4}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {authLoading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Verifying...</span></>
              ) : 'Login →'}
            </button>

            {/* Forgot links */}
            <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
              <button type="button" onClick={() => openForgot('id')} className="hover:text-primary transition-colors">
                Forgot Patient ID?
              </button>
              <button type="button" onClick={() => openForgot('pin')} className="hover:text-primary transition-colors">
                Forgot PIN?
              </button>
            </div>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-800 space-y-3">
            <p className="text-gray-400 text-sm text-center">
              New patient?{' '}
              <a href="/register" className="text-primary hover:text-primary-light font-semibold transition-colors">
                Register here →
              </a>
            </p>
            {/* Doctor Portal link */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-600">or</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            <a
              href="/doctor-login"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all duration-200 text-sm font-semibold"
            >
              👨‍⚕️ Doctor Portal →
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Smart GlycoVitals Logger © 2025 · ADA-Compliant Platform
        </p>
      </div>

      {/* Forgot modals */}
      {forgotMode && <ForgotModal mode={forgotMode} onClose={() => setForgotMode(null)} />}
    </div>
  );
}
