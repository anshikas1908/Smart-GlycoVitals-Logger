import { useState, useEffect } from 'react';
import { ref, get, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const DIABETES_TYPES = ['Type 1', 'Type 2', 'Pre-diabetic', 'Gestational'];

function Toast({ msg, type = 'success', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 bg-gray-900 border ${type === 'success' ? 'border-green-500/40 text-green-400' : 'border-red-500/40 text-red-400'} rounded-2xl shadow-2xl text-sm font-semibold animate-fade-in`}>
      {type === 'success' ? '✅' : '❌'} {msg}
    </div>
  );
}

function isValidPhone(v) { return /^\d{10}$/.test(v); }

function formatMonthYear(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^[A-Za-z]+\s+\d{4}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export default function Profile() {
  const { user, updateSessionProfile } = useAuth();
  const patientId = user?.patientId;

  const [data, setData] = useState(null);   // loaded from Firebase (read-only display)
  const [form, setForm] = useState(null);   // editable copy
  const [memberSince, setMemberSince] = useState('');
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);

  // PIN section
  const [pinOpen, setPinOpen] = useState(false);
  const [pins, setPins] = useState({ current: '', next: '', confirm: '' });
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');

  // Forgot PIN flow
  const [forgotMode, setForgotMode] = useState(false);   // true = showing forgot-pin UI
  const [forgotStep, setForgotStep] = useState(1);       // 1 = enter email, 2 = set new PIN
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPins, setForgotPins] = useState({ next: '', confirm: '' });
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [toast, setToast] = useState(null);

  const updPin = (k, v) => setPins(p => ({ ...p, [k]: v.replace(/\D/g, '').slice(0, 4) }));
  const updForgotPin = (k, v) => setForgotPins(p => ({ ...p, [k]: v.replace(/\D/g, '').slice(0, 4) }));

  const resetPinSection = () => {
    setPinOpen(false);
    setPins({ current: '', next: '', confirm: '' });
    setPinError('');
    setForgotMode(false);
    setForgotStep(1);
    setForgotEmail('');
    setForgotPins({ next: '', confirm: '' });
    setForgotError('');
  };

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    get(ref(db, `users/${patientId}`))
      .then(async (snap) => {
        if (cancelled) return;
        if (!snap.exists()) { setLoading(false); return; }
        const raw = snap.val();
        const p = raw.profile || raw;
        const profile = {
          name: p.name || '',
          age: String(p.age || ''),
          diabetesType: p.diabetesType || 'Type 2',
          email: p.email || '',
          phone: String(p.phone || ''),
          gender: p.gender || '',
          bloodGroup: p.bloodGroup || '',
        };
        setData(profile);
        setForm({ ...profile });

        let since = formatMonthYear(p.memberSince || raw.memberSince || p.createdAt || raw.createdAt);
        if (!since) {
          const readingsSnap = await get(ref(db, `users/${patientId}/readings`));
          if (readingsSnap.exists()) {
            const timestamps = Object.values(readingsSnap.val())
              .map((r) => Number(r?.timestamp))
              .filter((t) => !Number.isNaN(t) && t > 0);
            if (timestamps.length) {
              const oldest = Math.min(...timestamps);
              since = formatMonthYear(oldest);
            }
          }
        }
        if (!cancelled) {
          setMemberSince(since || '');
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [patientId]);

  const handleEdit = () => {
    setForm({ ...data });  // reset form to current saved data
    setPhoneError('');
    setEditMode(true);
  };

  const handleCancel = () => {
    setForm({ ...data });
    setPhoneError('');
    setEditMode(false);
  };

  const handlePhoneChange = v => {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    setForm(f => ({ ...f, phone: digits }));
    setPhoneError(digits.length > 0 && digits.length !== 10 ? 'Please enter a valid 10-digit mobile number.' : '');
  };

  const handleSave = async () => {
    if (form.phone && !isValidPhone(form.phone)) { setPhoneError('Please enter a valid 10-digit mobile number.'); return; }
    setSaving(true);
    try {
      const updatedAt = new Date().toISOString();
      await update(ref(db, `users/${patientId}`), {
        name: form.name,
        age: Number(form.age) || 0,
        diabetesType: form.diabetesType,
        gender: form.gender,
        bloodGroup: form.bloodGroup,
        email: form.email,
        phone: form.phone,
        updatedAt,
      });
      setData({ ...form });
      updateSessionProfile({ name: form.name });
      setEditMode(false);
      setToast({ msg: 'Profile updated! ✅', type: 'success' });
    } catch {
      setToast({ msg: 'Failed to save. Please try again. ❌', type: 'error' });
    }
    setSaving(false);
  };

  const handlePinUpdate = async () => {
    setPinError('');
    if (!pins.current) { setPinError('Enter your current PIN.'); return; }
    if (pins.next.length !== 4) { setPinError('New PIN must be 4 digits.'); return; }
    if (pins.next !== pins.confirm) { setPinError('PINs do not match.'); return; }
    setPinLoading(true);
    try {
      const snap = await get(ref(db, `users/${patientId}`));
      const userData = snap.exists() ? snap.val() : {};
      // Fall back to '0000' if no PIN stored — same default as login
      const stored = String(userData.pin ?? userData.profile?.pin ?? '0000');
      if (pins.current !== stored) { setPinError('Incorrect current PIN ❌'); setPinLoading(false); return; }
      await update(ref(db, `users/${patientId}`), { pin: pins.next });
      setPins({ current: '', next: '', confirm: '' });
      setPinOpen(false);
      setToast({ msg: 'PIN updated successfully! ✅', type: 'success' });
    } catch { setPinError('Failed to update. Check connection.'); }
    setPinLoading(false);
  };

  // Forgot PIN — Step 1: verify email matches account
  const handleForgotEmailVerify = async () => {
    setForgotError('');
    if (!forgotEmail.trim()) { setForgotError('Please enter your registered email.'); return; }
    setForgotLoading(true);
    try {
      const snap = await get(ref(db, `users/${patientId}`));
      const userData = snap.exists() ? snap.val() : {};
      const storedEmail = String(userData.email || userData.profile?.email || '').toLowerCase();
      if (!storedEmail) { setForgotError('No email is linked to this account. Contact support.'); setForgotLoading(false); return; }
      if (forgotEmail.trim().toLowerCase() !== storedEmail) { setForgotError('Email does not match our records. ❌'); setForgotLoading(false); return; }
      setForgotStep(2);
    } catch { setForgotError('Connection error. Please try again.'); }
    setForgotLoading(false);
  };

  // Forgot PIN — Step 2: set new PIN
  const handleForgotPinSet = async () => {
    setForgotError('');
    if (forgotPins.next.length !== 4) { setForgotError('New PIN must be exactly 4 digits.'); return; }
    if (forgotPins.next !== forgotPins.confirm) { setForgotError('PINs do not match.'); return; }
    setForgotLoading(true);
    try {
      await update(ref(db, `users/${patientId}`), { pin: forgotPins.next });
      resetPinSection();
      setToast({ msg: 'PIN has been reset successfully! ✅', type: 'success' });
    } catch { setForgotError('Failed to save. Check connection.'); }
    setForgotLoading(false);
  };

  if (loading) return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      {[1,2,3,4].map(i => <div key={i} className="card h-16 animate-pulse bg-gray-800/50" />)}
    </div>
  );

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  if (!editMode) {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">👤 My Profile</h1>
          <p className="text-gray-400 text-sm mt-0.5">Your personal information</p>
        </div>

        <div className="card space-y-0 divide-y divide-gray-800/60">
          {/* Header row */}
          <div className="pb-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-3xl flex-shrink-0">
              {data?.gender === 'Female' ? '👩' : '👨'}
            </div>
            <div>
              <div className="text-xl font-bold text-white">{data?.name || '—'}</div>
              <div className="text-sm text-primary font-mono mt-0.5">{patientId}</div>
              <div className="text-xs text-gray-500 mt-0.5">Member since {memberSince || '—'}</div>
            </div>
          </div>

          {/* Info rows */}
          {[
            { label: 'Patient ID', value: patientId, locked: true },
            { label: 'Full Name', value: data?.name },
            { label: 'Age', value: data?.age ? `${data.age} years` : '—' },
            { label: 'Diabetes Type', value: data?.diabetesType },
            { label: 'Gender', value: data?.gender || '—' },
            { label: 'Blood Group', value: data?.bloodGroup || '—' },
            { label: 'Email', value: data?.email || '—' },
            { label: 'Phone', value: data?.phone || '—' },
            { label: 'Member Since', value: memberSince || '—', locked: true },
          ].map(({ label, value, locked }) => (
            <div key={label} className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-400 w-32 flex-shrink-0">{label}</span>
              <span className="flex items-center gap-2 text-sm text-white font-medium text-right">
                {value || '—'}
                {locked && <span className="text-gray-600 text-xs">🔒</span>}
              </span>
            </div>
          ))}
        </div>

        <button onClick={handleEdit} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          ✏️ Edit Profile
        </button>

        {/* Change PIN collapsible */}
        <PinSection
          pinOpen={pinOpen} setPinOpen={setPinOpen}
          pins={pins} updPin={updPin} pinError={pinError}
          pinLoading={pinLoading} onUpdate={handlePinUpdate}
          onCancel={resetPinSection}
          forgotMode={forgotMode} setForgotMode={(v) => { setForgotMode(v); setForgotStep(1); setForgotEmail(''); setForgotPins({ next:'', confirm:'' }); setForgotError(''); }}
          forgotStep={forgotStep}
          forgotEmail={forgotEmail} setForgotEmail={setForgotEmail}
          forgotPins={forgotPins} updForgotPin={updForgotPin}
          forgotError={forgotError} forgotLoading={forgotLoading}
          onForgotVerify={handleForgotEmailVerify}
          onForgotSet={handleForgotPinSet}
        />

        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  const isSaveDisabled = saving || (form.phone.length > 0 && !isValidPhone(form.phone));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={handleCancel} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">←</button>
        <div>
          <h1 className="text-2xl font-bold text-white">✏️ Edit Profile</h1>
          <p className="text-gray-400 text-sm mt-0.5">Update your information</p>
        </div>
      </div>

      <div className="card space-y-4">
        {/* Read-only badges */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/60 rounded-xl px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Patient ID</div>
            <div className="font-bold text-primary font-mono flex items-center gap-1">{patientId} <span className="text-gray-600 text-xs">🔒</span></div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Member Since</div>
            <div className="font-semibold text-gray-300 text-sm flex items-center gap-1">{memberSince || '—'} <span className="text-gray-600 text-xs">🔒</span></div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Full Name</label>
            <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className="input-field text-sm" placeholder="Full Name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Age</label>
            <input type="number" value={form.age} onChange={e => setForm(f=>({...f,age:e.target.value}))} className="input-field text-sm" min="1" max="120" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Diabetes Type</label>
            <select value={form.diabetesType} onChange={e => setForm(f=>({...f,diabetesType:e.target.value}))} className="input-field text-sm">
              {DIABETES_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Gender</label>
            <select value={form.gender} onChange={e => setForm(f=>({...f,gender:e.target.value}))} className="input-field text-sm">
              <option value="">Select gender</option>
              {['Male','Female','Other'].map(g=><option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Blood Group</label>
            <select value={form.bloodGroup} onChange={e => setForm(f=>({...f,bloodGroup:e.target.value}))} className="input-field text-sm">
              <option value="">Select</option>
              {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} className="input-field text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Phone <span className="text-gray-600">(10 digits)</span></label>
            <input
              type="tel" inputMode="numeric" maxLength={10}
              value={form.phone}
              onChange={e => handlePhoneChange(e.target.value)}
              onKeyDown={e => { if (!/[\d]/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key)) e.preventDefault(); }}
              className={`input-field text-sm ${phoneError ? 'border-red-500/60' : form.phone.length === 10 ? 'border-green-500/60' : ''}`}
              placeholder="9876543210"
            />
            {phoneError && <p className="text-red-400 text-xs mt-1">{phoneError}</p>}
            {!phoneError && form.phone.length === 10 && <p className="text-green-400 text-xs mt-1">✓ Valid</p>}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={handleCancel} className="btn-secondary flex-1 py-2.5">Cancel</button>
          <button onClick={handleSave} disabled={isSaveDisabled} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Saving…</span></> : '💾 Save Changes'}
          </button>
        </div>
      </div>

      {/* Change PIN collapsible */}
      <PinSection
        pinOpen={pinOpen} setPinOpen={setPinOpen}
        pins={pins} updPin={updPin} pinError={pinError}
        pinLoading={pinLoading} onUpdate={handlePinUpdate}
        onCancel={resetPinSection}
        forgotMode={forgotMode} setForgotMode={(v) => { setForgotMode(v); setForgotStep(1); setForgotEmail(''); setForgotPins({ next:'', confirm:'' }); setForgotError(''); }}
        forgotStep={forgotStep}
        forgotEmail={forgotEmail} setForgotEmail={setForgotEmail}
        forgotPins={forgotPins} updForgotPin={updForgotPin}
        forgotError={forgotError} forgotLoading={forgotLoading}
        onForgotVerify={handleForgotEmailVerify}
        onForgotSet={handleForgotPinSet}
      />

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function PinSection({
  pinOpen, setPinOpen, pins, updPin, pinError, pinLoading, onUpdate, onCancel,
  forgotMode, setForgotMode, forgotStep,
  forgotEmail, setForgotEmail, forgotPins, updForgotPin,
  forgotError, forgotLoading, onForgotVerify, onForgotSet,
}) {
  return (
    <div className="card">
      {/* Collapsible header */}
      <button
        className="w-full flex items-center justify-between group"
        onClick={() => { setPinOpen(o => !o); if (forgotMode) setForgotMode(false); }}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-yellow-500 inline-block" />
          <h2 className="text-base font-semibold text-gray-200 group-hover:text-white transition-colors">🔐 Change PIN</h2>
        </div>
        <span className={`text-gray-400 text-lg transition-transform duration-200 ${pinOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {pinOpen && (
        <div className="mt-4 space-y-4 animate-fade-in border-t border-gray-800 pt-4">

          {/* ── FORGOT PIN FLOW ── */}
          {forgotMode ? (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${forgotStep >= 1 ? 'bg-primary text-white' : 'bg-gray-700 text-gray-400'}`}>1</div>
                <div className={`flex-1 h-px ${forgotStep >= 2 ? 'bg-primary' : 'bg-gray-700'}`} />
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${forgotStep >= 2 ? 'bg-primary text-white' : 'bg-gray-700 text-gray-400'}`}>2</div>
              </div>

              {forgotStep === 1 ? (
                <>
                  <p className="text-xs text-gray-400">Enter the email address linked to your account to verify your identity.</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Registered Email</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input-field text-sm"
                      onKeyDown={e => e.key === 'Enter' && onForgotVerify()}
                    />
                  </div>
                  {forgotError && <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-red-400 text-sm"><span>⚠️</span>{forgotError}</div>}
                  <div className="flex gap-3">
                    <button onClick={() => setForgotMode(false)} className="btn-secondary flex-1 py-2.5 text-sm">← Back</button>
                    <button onClick={onForgotVerify} disabled={forgotLoading} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                      {forgotLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Verifying…</span></> : 'Verify Email →'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                    ✅ Email verified — set your new PIN below.
                  </div>
                  {[{key:'next',label:'New PIN'},{key:'confirm',label:'Confirm New PIN'}].map(({key,label}) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
                      <input type="password" inputMode="numeric" maxLength={4} value={forgotPins[key]}
                        onChange={e => updForgotPin(key, e.target.value)} placeholder="●●●●"
                        className="input-field text-center font-mono tracking-widest text-lg max-w-xs" />
                    </div>
                  ))}
                  {forgotError && <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-red-400 text-sm"><span>⚠️</span>{forgotError}</div>}
                  <div className="flex gap-3">
                    <button onClick={onCancel} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
                    <button onClick={onForgotSet} disabled={forgotLoading} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                      {forgotLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Saving…</span></> : '🔒 Reset PIN'}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            /* ── NORMAL CHANGE PIN FORM ── */
            <>
              {[{key:'current',label:'Current PIN'},{key:'next',label:'New PIN'},{key:'confirm',label:'Confirm New PIN'}].map(({key,label}) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
                  <input type="password" inputMode="numeric" maxLength={4} value={pins[key]}
                    onChange={e => updPin(key, e.target.value)} placeholder="●●●●"
                    className="input-field text-center font-mono tracking-widest text-lg max-w-xs" />
                </div>
              ))}
              {pinError && <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-red-400 text-sm"><span>⚠️</span>{pinError}</div>}
              {/* Forgot PIN link */}
              <button
                onClick={() => setForgotMode(true)}
                className="text-xs text-primary hover:text-primary/80 transition-colors underline-offset-2 hover:underline"
              >
                Forgot PIN?
              </button>
              <div className="flex gap-3">
                <button onClick={onCancel} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
                <button onClick={onUpdate} disabled={pinLoading} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                  {pinLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Updating…</span></> : '🔒 Update PIN'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
