import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ref, get, set } from 'firebase/database';
import { db } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import DoctorLogin from './pages/DoctorLogin';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import DoctorDashboard from './pages/DoctorDashboard';
import LogReading from './pages/LogReading';
import Profile from './pages/Profile';

function RequirePatient({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'patient') return <Navigate to="/doctor" replace />;
  return children;
}

function RequireDoctor({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'doctor') return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  // Fix 5: Auto-init doctors/DOC001 if it doesn't exist in Firebase
  useEffect(() => {
    const initDoctor = async () => {
      try {
        const snap = await get(ref(db, 'doctors/DOC001'));
        if (!snap.exists()) {
          await set(ref(db, 'doctors/DOC001'), {
            name: 'Dr. Rajesh Kumar',
            pin: '1234',
            email: 'dr.rajesh@hospital.com',
            specialization: 'Diabetologist',
            hospital: 'City Diabetes Care Center',
            phone: '9811122233',
            createdAt: '2026-01-01',
          });
          console.log('[GlycoVitals] doctors/DOC001 initialized.');
        }
      } catch (e) {
        // Silently fail — login will show appropriate error
        console.warn('[GlycoVitals] Could not check/init doctor account:', e.message);
      }
    };
    initDoctor();
  }, []);

  const defaultRedirect = !user
    ? '/login'
    : user.role === 'doctor'
    ? '/doctor'
    : '/dashboard';

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to={defaultRedirect} replace /> : <Login />} />
      <Route path="/doctor-login" element={user ? <Navigate to={defaultRedirect} replace /> : <DoctorLogin />} />
      <Route path="/register" element={user ? <Navigate to={defaultRedirect} replace /> : <Register />} />

      {/* Patient routes */}
      <Route path="/" element={<RequirePatient><Layout /></RequirePatient>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="log-reading" element={<LogReading />} />
        <Route path="history" element={<History />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* Doctor route */}
      <Route path="/doctor" element={<RequireDoctor><DoctorDashboard /></RequireDoctor>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={defaultRedirect} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
