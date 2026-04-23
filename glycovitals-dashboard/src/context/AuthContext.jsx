/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';
import { ref, get, set } from 'firebase/database';
import { db } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('glyco_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const saveSession = (u) => {
    localStorage.setItem('glyco_session', JSON.stringify(u));
    setUser(u);
  };

  // Patient login — verifies PIN from Firebase (defaults to "0000" if not set)
  const loginPatient = useCallback(async (patientId, pin) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const pid = patientId.trim().toUpperCase();
      if (!pid.match(/^U\d{3,4}$/)) {
        setAuthError('Invalid Patient ID format. Use format like U001.');
        return false;
      }

      const userSnap = await get(ref(db, `users/${pid}`));
      if (!userSnap.exists()) {
        setAuthError('Invalid Patient ID or PIN.');
        return false;
      }

      const storedPin = userSnap.child('pin').exists()
        ? String(userSnap.child('pin').val())
        : '0000';

      if (pin !== storedPin) {
        setAuthError('Invalid Patient ID or PIN.');
        return false;
      }

      // Try profile at either users/{pid}/profile or users/{pid} directly
      const profile = userSnap.child('profile').exists()
        ? userSnap.child('profile').val()
        : userSnap.val();

      saveSession({
        patientId: pid,
        role: 'patient',
        name: profile?.name || `Patient ${pid}`,
      });
      return true;
    } catch {
      setAuthError('Connection error. Please try again.');
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Doctor login — checks Firebase doctors/{docId}
  const loginDoctor = useCallback(async (docId, pin) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const did = docId.trim().toUpperCase();
      const docSnap = await get(ref(db, `doctors/${did}`));

      if (!docSnap.exists()) {
        setAuthError('Invalid Doctor ID or PIN.');
        return false;
      }

      const docData = docSnap.val();
      const storedPin = String(docData.pin || '1234');

      if (pin !== storedPin) {
        setAuthError('Invalid Doctor ID or PIN.');
        return false;
      }

      saveSession({
        doctorId: did,
        role: 'doctor',
        name: docData.name || `Doctor ${did}`,
        selectedPatient: 'U001',
      });
      return true;
    } catch {
      setAuthError('Connection error.');
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Register new patient
  const register = useCallback(async (formData) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const usersSnap = await get(ref(db, 'users'));
      let maxNum = 10;

      // Check for duplicate email
      if (formData.email && usersSnap.exists()) {
        const users = usersSnap.val();
        for (const [, data] of Object.entries(users)) {
          const profile = data.profile || data;
          if (profile.email && profile.email.toLowerCase() === formData.email.toLowerCase()) {
            setAuthError('An account already exists with this email.');
            return { success: false };
          }
        }
      }

      if (usersSnap.exists()) {
        Object.keys(usersSnap.val()).forEach(key => {
          const match = key.match(/^U(\d+)$/);
          if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
        });
      }
      const newId = `U${String(maxNum + 1).padStart(3, '0')}`;

      const now = new Date();
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const memberSince = `${months[now.getMonth()]} ${now.getFullYear()}`;
      const createdAt = now.toISOString();

      await set(ref(db, `users/${newId}`), {
        pin: formData.pin,
        name: formData.name,
        age: formData.age,
        diabetesType: formData.diabetesType,
        gender: formData.gender || '',
        bloodGroup: formData.bloodGroup || '',
        email: formData.email,
        phone: formData.phone,
        createdAt,
        memberSince,
        entryType: 'self-registered',
      });

      // Auto-login after registration
      saveSession({
        patientId: newId,
        role: 'patient',
        name: formData.name,
      });

      return { success: true, patientId: newId };
    } catch {
      setAuthError('Registration failed. Please try again.');
      return { success: false };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Doctor switches which patient they're viewing
  const setDoctorPatient = useCallback((pid) => {
    setUser(prev => {
      const updated = { ...prev, selectedPatient: pid };
      localStorage.setItem('glyco_session', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('glyco_session');
    setUser(null);
    setAuthError('');
  }, []);

  const clearError = () => setAuthError('');
  const updateSessionProfile = useCallback((patch) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      localStorage.setItem('glyco_session', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      authError,
      authLoading,
      loginPatient,
      loginDoctor,
      register,
      logout,
      clearError,
      setDoctorPatient,
      updateSessionProfile,
      activePatientId: user?.role === 'doctor' ? user.selectedPatient : user?.patientId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
