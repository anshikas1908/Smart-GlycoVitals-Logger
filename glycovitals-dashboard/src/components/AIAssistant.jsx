import { useState, useRef, useEffect } from 'react';
import { ref, query, orderByChild, limitToLast, get } from 'firebase/database';
import { db } from '../firebase';

const QUICK_QUESTIONS = [
  'Is my glucose level safe?',
  'What should I eat now?',
  'When should I be worried?',
  'Explain my prediction',
];

async function fetchPatientContext(patientId) {
  try {
    const readRef = query(ref(db, `users/${patientId}/readings`), orderByChild('timestamp'), limitToLast(12));
    const predRef = query(ref(db, `users/${patientId}/predictions`), orderByChild('timestamp'), limitToLast(3));
    const [readSnap, predSnap] = await Promise.all([get(readRef), get(predRef)]);
    const readings = readSnap.val() ? Object.values(readSnap.val()).sort((a, b) => b.timestamp - a.timestamp) : [];
    const preds = predSnap.val() ? Object.values(predSnap.val()).sort((a, b) => b.timestamp - a.timestamp) : [];
    const latest = readings[0];
    return {
      patientId,
      currentGlucose: latest?.glucose,
      heartRate: latest?.heartRate,
      temperature: latest?.temperature,
      recentReadings: readings.slice(0, 6).map(r => ({ glucose: r.glucose, time: new Date(r.timestamp).toLocaleTimeString() })),
      latestPrediction: preds[0] || null,
      alerts: preds[0]?.alerts || [],
      timestamp: new Date().toLocaleString(),
    };
  } catch (e) {
    return { patientId, error: e.message };
  }
}

async function askGemini(userMessage, context) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    throw new Error('Please set VITE_GEMINI_API_KEY in your .env file and restart the server.');
  }

  const alertStatus =
    context.alerts && context.alerts.length > 0
      ? context.alerts.join(', ')
      : 'None';

  const systemContext =
    `You are GlycoAI, a helpful medical assistant specialized in diabetes and glucose monitoring.\n\n` +
    `Current patient data:\n` +
    `- Patient ID: ${context.patientId}\n` +
    `- Current Glucose: ${context.currentGlucose != null ? `${Math.round(context.currentGlucose)} mg/dL` : 'N/A'}\n` +
    `- Heart Rate: ${context.heartRate != null ? `${Math.round(context.heartRate)} bpm` : 'N/A'}\n` +
    `- Temperature: ${context.temperature != null ? `${context.temperature.toFixed(1)}°C` : 'N/A'}\n` +
    `- Predicted Glucose (30 min): ${context.latestPrediction?.predicted30min != null ? `${Math.round(context.latestPrediction.predicted30min)} mg/dL` : 'N/A'}\n` +
    `- Alert Status: ${alertStatus}\n` +
    `- Recent Readings (last 6): ${JSON.stringify(context.recentReadings ?? [])}\n\n` +
    `ADA Guidelines:\n` +
    `- Normal range: 70–180 mg/dL\n` +
    `- Low (hypoglycemia): < 70 mg/dL\n` +
    `- Critical low: < 54 mg/dL\n` +
    `- High (hyperglycemia): > 180 mg/dL\n` +
    `- Critical high: > 250 mg/dL\n\n` +
    `Rules:\n` +
    `- Give simple, clear health advice\n` +
    `- Always recommend consulting a real doctor\n` +
    `- If glucose is below 70: give URGENT low glucose advice\n` +
    `- If glucose is above 180: give URGENT high glucose advice\n` +
    `- Keep responses short and helpful (max ~200 words)\n` +
    `- Never diagnose, only advise`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: systemContext + '\n\nPatient asks: ' + userMessage,
              },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();
  console.log('AI RESPONSE:', data);

  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini API error ${response.status}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini.');
  return text;
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 text-sm mt-0.5">✨</div>
      )}
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-primary text-white rounded-tr-sm'
          : 'bg-gray-800 text-gray-100 border border-gray-700 rounded-tl-sm'
      }`}>
        {msg.content}
      </div>
    </div>
  );
}

export default function AIAssistant({ patientId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello! I'm GlycoAI, your diabetes health assistant. I have access to your real-time glucose data (Patient ${patientId || 'N/A'}). How can I help you today?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Update greeting when patient changes
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: `Hello! I'm GlycoAI, your diabetes health assistant. I have access to your real-time glucose data (Patient ${patientId || 'N/A'}). How can I help you today?`,
      },
    ]);
  }, [patientId]);

  // Allow the nav-bar "AI Assistant" item to open this panel via a custom event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('glyco-open-ai', handler);
    return () => window.removeEventListener('glyco-open-ai', handler);
  }, []);

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg || loading || cooldown) return;
    setInput('');

    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);
    setCooldown(true);

    try {
      const context = await fetchPatientContext(patientId || 'U001');
      const reply = await askGemini(userMsg, context);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      console.error('[GlycoAI Error]', e);
      const errMsg = e.message.includes('set your VITE_GEMINI_KEY')
        ? '⚠️ Please add your Gemini API key in the .env file (VITE_GEMINI_KEY=your_key_here) and restart the server.'
        : `⚠️ AI Error: ${e.message}`;
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
    } finally {
      setLoading(false);
      // 2-second cooldown to prevent spam
      setTimeout(() => setCooldown(false), 2000);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-primary hover:bg-primary-dark shadow-xl shadow-primary/30 flex items-center justify-center text-white text-2xl transition-all duration-300 hover:scale-110 active:scale-95"
        title="GlycoAI Assistant"
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[340px] sm:w-[380px] max-h-[580px] flex flex-col rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl shadow-black/50 animate-slide-in">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-800 bg-gray-900 rounded-t-2xl">
            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-lg">✨</div>
            <div>
              <div className="font-semibold text-white text-sm">GlycoAI Assistant</div>
              <div className="text-xs text-primary flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                Powered by Gemini AI · {patientId || '—'}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto text-gray-400 hover:text-white transition-colors text-lg">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0" style={{ maxHeight: '320px' }}>
            {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
            {loading && (
              <div className="flex gap-3 justify-start animate-fade-in">
                <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-sm">✨</div>
                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">GlycoAI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions */}
          <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={loading || cooldown}
                className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-full transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask about your glucose..."
                className="input-field text-sm py-2 flex-1"
                disabled={loading || cooldown}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading || cooldown}
                className="btn-primary px-3 py-2 disabled:opacity-40 transition-opacity"
                title="Send"
              >
                →
              </button>
            </div>
            {cooldown && !loading && (
              <div className="text-[10px] text-gray-500 mt-1 text-center">Please wait a moment before sending again…</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
