import { useState, useMemo } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AIAssistant from './AIAssistant';
import AddReadingModal from './AddReadingModal';
import { usePatientData, useAllReadings } from '../hooks/usePatientData';

const NAV_ITEMS = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { to: '/log-reading', icon: '📝', label: 'Log Reading' },
  { to: '/history', icon: '📋', label: 'History' },
  { to: '/analytics', icon: '📊', label: 'Analytics' },
  { to: '/alerts', icon: '🔔', label: 'Alerts' },
  { to: '/profile', icon: '👤', label: 'Profile' },
];

export default function Layout() {
  const { user, logout, activePatientId } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const { readings } = usePatientData(activePatientId);
  const { readings: allReadings } = useAllReadings(activePatientId);

  // Compute live alert count for badge
  const alertCount = useMemo(() => {
    return allReadings.filter(r => {
      const g = Number(r.glucose);
      return g < 70 || g > 180;
    }).length;
  }, [allReadings]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 flex-shrink-0 flex flex-col
        bg-gray-900 border-r border-gray-800
        transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-lg">💉</div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">Smart</div>
            <div className="text-xs text-primary font-semibold leading-tight">GlycoVitals</div>
          </div>
        </div>

        {/* Patient info */}
        <div className="mx-4 mt-4 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl">
          <div className="text-xs text-gray-400 mb-0.5">Logged in as</div>
          <div className="text-white font-bold text-sm">{user?.name || activePatientId}</div>
          <div className="text-xs text-primary mt-0.5 font-mono">{user?.patientId}</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => isActive ? 'nav-link-active' : 'nav-link'}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
              {item.to === '/alerts' && alertCount > 0 && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger text-white min-w-[18px] text-center">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </NavLink>
          ))}
          <button
            className="nav-link text-primary w-full"
            onClick={() => { setSidebarOpen(false); window.dispatchEvent(new CustomEvent('glyco-open-ai')); }}
          >
            <span className="text-lg">🤖</span>
            <span>AI Assistant</span>
          </button>
        </nav>

        {/* Bottom */}
        <div className="px-4 py-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="nav-link w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
          >
            <span className="text-lg">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-white font-semibold">Smart GlycoVitals</span>
          <span className="ml-auto text-xs text-primary font-mono">{user?.patientId}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant */}
      <AIAssistant patientId={activePatientId} />

      {/* Floating Add Reading Button */}
      <button
        onClick={() => setAddModalOpen(true)}
        title="Add Reading"
        className="fixed bottom-28 right-5 z-50 w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 text-white text-2xl shadow-xl shadow-green-900/50 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
        style={{ boxShadow: '0 0 0 0 rgba(34,197,94,0.5)' }}
      >
        ➕
      </button>

      {/* Add Reading Modal */}
      {addModalOpen && (
        <AddReadingModal
          patientId={activePatientId}
          readings={readings}
          onClose={() => setAddModalOpen(false)}
        />
      )}
    </div>
  );
}
