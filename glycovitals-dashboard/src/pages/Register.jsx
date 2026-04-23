import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DIABETES_TYPES = ['Type 1', 'Type 2', 'Pre-diabetic', 'Gestational', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

export default function Register() {
  const { register, authError, authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', age: '', diabetesType: 'Type 2',
    gender: '', bloodGroup: '',
    email: '', phone: '', pin: '', confirmPin: '',
  });
  const [step, setStep] = useState('form'); // 'form' | 'success'
  const [newPatientId, setNewPatientId] = useState('');
  const [localError, setLocalError] = useState('');

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!form.name.trim()) { setLocalError('Full name is required.'); return; }
    const age = parseInt(form.age);
    if (!age || age < 1 || age > 120) { setLocalError('Age must be between 1 and 120.'); return; }
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { setLocalError('Please enter a valid email.'); return; }
    if (!form.phone.match(/^\d{10}$/)) { setLocalError('Phone must be exactly 10 digits.'); return; }
    if (form.pin.length !== 4) { setLocalError('PIN must be exactly 4 digits.'); return; }
    if (form.pin !== form.confirmPin) { setLocalError('PINs do not match.'); return; }

    const result = await register({
      name: form.name.trim(),
      age,
      diabetesType: form.diabetesType,
      gender: form.gender,
      bloodGroup: form.bloodGroup,
      email: form.email.trim(),
      phone: form.phone.trim(),
      pin: form.pin,
    });

    if (result.success) {
      setNewPatientId(result.patientId);
      setStep('success');
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md card text-center animate-fade-in shadow-2xl">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">Account Created!</h2>
          <p className="text-gray-400 mb-6 text-sm">Welcome to Smart GlycoVitals Logger</p>

          <div className="bg-primary/10 border-2 border-primary/40 rounded-2xl px-8 py-6 mb-4">
            <div className="text-sm text-gray-400 mb-1">Your Patient ID</div>
            <div className="text-5xl font-black text-primary tracking-widest">{newPatientId}</div>
            <div className="text-xs text-gray-500 mt-2">⚠️ Save this! You need it to login every time.</div>
          </div>

          <button
            onClick={() => navigator.clipboard?.writeText(newPatientId)}
            className="btn-secondary text-sm py-2 px-4 mb-4"
          >
            📋 Copy ID
          </button>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-5 text-left">
            <p className="text-xs text-yellow-300 font-semibold mb-1">⚠️ IMPORTANT</p>
            <p className="text-xs text-gray-400">Your Patient ID has been saved. Please write it down or save it in your phone.</p>
          </div>

          <button onClick={() => navigate('/dashboard')} className="btn-primary w-full py-3">
            Go to My Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(0,151,167,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,151,167,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 mb-3 text-3xl">💉</div>
          <h1 className="text-2xl font-bold text-white">Create Your Account</h1>
          <p className="text-gray-400 text-sm mt-1">Smart GlycoVitals Logger</p>
        </div>

        <div className="card shadow-2xl shadow-black/40">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name & Age */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Full Name *</label>
                <input type="text" value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Full Name" className="input-field text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Age *</label>
                <input type="number" value={form.age} onChange={e => upd('age', e.target.value)} placeholder="35" min="1" max="120" className="input-field text-sm" required />
              </div>
            </div>

            {/* Diabetes Type */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Diabetes Type *</label>
              <select value={form.diabetesType} onChange={e => upd('diabetesType', e.target.value)} className="input-field text-sm">
                {DIABETES_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Gender & Blood Group */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Gender</label>
                <select value={form.gender} onChange={e => upd('gender', e.target.value)} className="input-field text-sm">
                  <option value="">Select gender</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Blood Group</label>
                <select value={form.bloodGroup} onChange={e => upd('bloodGroup', e.target.value)} className="input-field text-sm">
                  <option value="">Select blood group</option>
                  {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email *</label>
                <input type="email" value={form.email} onChange={e => upd('email', e.target.value)} placeholder="you@example.com" className="input-field text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Phone * (10 digits)</label>
                <input type="tel" value={form.phone} onChange={e => upd('phone', e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="9876543210" className="input-field text-sm" required />
              </div>
            </div>

            {/* PIN */}
            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-400 mb-3">🔒 Create your login PIN</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">4-Digit PIN *</label>
                  <input
                    type="password" inputMode="numeric" maxLength={4}
                    value={form.pin} onChange={e => upd('pin', e.target.value.replace(/\D/g,'').slice(0,4))}
                    placeholder="●●●●" className="input-field text-center font-mono tracking-widest text-lg" required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm PIN *</label>
                  <input
                    type="password" inputMode="numeric" maxLength={4}
                    value={form.confirmPin} onChange={e => upd('confirmPin', e.target.value.replace(/\D/g,'').slice(0,4))}
                    placeholder="●●●●"
                    className={`input-field text-center font-mono tracking-widest text-lg ${form.confirmPin && form.confirmPin !== form.pin ? 'border-danger/60' : form.confirmPin && form.confirmPin === form.pin ? 'border-success/60' : ''}`}
                    required
                  />
                </div>
              </div>
            </div>

            {(localError || authError) && (
              <div className="flex items-center gap-2.5 p-3 bg-danger/10 border border-danger/30 rounded-lg text-red-400 text-sm">
                <span>⚠️</span> {localError || authError}
              </div>
            )}

            <button type="submit" disabled={authLoading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {authLoading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Creating account...</span></>
                : '✅ Create My Account'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-gray-800 text-center">
            <p className="text-gray-400 text-sm">
              Already have an account?{' '}
              <a href="/login" className="text-primary hover:text-primary-light font-semibold transition-colors">Login →</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
