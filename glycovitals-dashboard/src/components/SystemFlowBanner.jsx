/**
 * SystemFlowBanner.jsx
 * ─────────────────────
 * Animated data pipeline strip showing:
 *   React UI → Firebase → Python LSTM/Fallback → Firebase → React UI
 *
 * Props:
 *   predMode  ('lstm' | 'fallback' | 'lstm-stale' | 'none') – shown as live badge
 *   readingsNeeded  (number) – how many more readings to LSTM activation
 */
export default function SystemFlowBanner({ predMode = 'none', readingsNeeded = 0 }) {
  const nodes = [
    { icon: '⚛️',  label: 'React UI',     sub: 'Frontend',       color: '#61DAFB' },
    { icon: '🔥',  label: 'Firebase',      sub: 'Realtime DB',    color: '#FFA000' },
    { icon: '🐍',  label: 'LSTM Script',   sub: 'Python ML',      color: '#4CAF50' },
    { icon: '🔥',  label: 'Firebase',      sub: 'Predictions',    color: '#FFA000' },
    { icon: '📊',  label: 'Dashboard',     sub: 'React UI',       color: '#61DAFB' },
  ];

  const modeInfo = (() => {
    if (predMode === 'lstm')
      return { label: 'LSTM Active', color: '#22d3ee', bg: 'rgba(34,211,238,0.1)', border: 'rgba(34,211,238,0.3)' };
    if (predMode === 'fallback' || predMode === 'lstm-stale')
      return { label: 'Fallback Mode', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' };
    return null;
  })();

  return (
    <div className="card py-3 px-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
          System Data Flow
        </div>
        {modeInfo && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ color: modeInfo.color, background: modeInfo.bg, border: `1px solid ${modeInfo.border}` }}
          >
            <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: modeInfo.color }} />
            {modeInfo.label}
            {predMode !== 'lstm' && readingsNeeded > 0 && (
              <span className="ml-1 opacity-70">· {readingsNeeded} readings left</span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 flex-wrap">
        {nodes.map((n, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="flex flex-col items-center min-w-[52px]">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-1 transition-all duration-300 animate-float"
                style={{
                  background: `${n.color}18`,
                  border: `1px solid ${n.color}40`,
                  animationDelay: `${i * 0.35}s`,
                }}
              >
                {n.icon}
              </div>
              <div className="text-white text-[10px] font-semibold leading-tight text-center">{n.label}</div>
              <div className="text-gray-500 text-[9px] text-center">{n.sub}</div>
            </div>
            {i < nodes.length - 1 && (
              <div
                className="text-gray-500 text-sm font-bold mx-0.5 mb-4 animate-flow"
                style={{ animationDelay: `${i * 0.2}s` }}
              >
                →
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
