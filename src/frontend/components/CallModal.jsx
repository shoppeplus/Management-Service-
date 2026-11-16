/**
 * CallModal Component (Simulated VoIP Sales Call)
 * ──────────────────────────────────────────────
 * Provides a realistic simulated telephone / VoIP call interface:
 * - Calling state: "Đang gọi đi..." -> "Đang đổ chuông..." -> "Đã kết nối (00:01...)"
 * - Sound wave visualization effect
 * - Timer counter
 * - Interactive controls: Mute mic, Speaker, Keypad, Call Notes
 * - On Hang Up: Automatically records call interaction into Customer timeline with exact duration!
 */

(function () {
  'use strict';

  const { useState, useEffect, useRef } = window.React;

  function CallModal({ isOpen, customer, onClose, onCallCompleted, showToast }) {
    if (!isOpen) return null;

    const [callState, setCallState] = useState('ringing'); // 'ringing' | 'connected' | 'ended'
    const [seconds, setSeconds] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(true);
    const [callNote, setCallNote] = useState('');
    const timerRef = useRef(null);

    // Auto connect after 2 seconds
    useEffect(() => {
      const ringTimer = setTimeout(() => {
        setCallState('connected');
      }, 2000);

      return () => clearTimeout(ringTimer);
    }, []);

    // Timer when connected
    useEffect(() => {
      if (callState === 'connected') {
        timerRef.current = setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
      }

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [callState]);

    const formatTime = (totalSec) => {
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const handleEndCall = () => {
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);

      const noteText = callNote.trim() || 'Tư vấn nhu cầu và hỗ trợ kỹ thuật về sản phẩm.';
      const completedCall = {
        id: 'call_' + Date.now(),
        type: 'call',
        title: `Cuộc gọi đi (${formatTime(seconds)})`,
        content: noteText,
        date: new Date().toLocaleDateString('vi-VN'),
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        color: 'emerald',
      };

      if (onCallCompleted) onCallCompleted(completedCall);
      if (showToast) showToast(`Cuộc gọi kết thúc (${formatTime(seconds)}). Đã lưu lịch sử tương tác!`, 'success');

      setTimeout(() => {
        onClose();
      }, 500);
    };

    const targetCustomer = customer || {
      name: 'Nguyễn Minh Anh',
      phone: '0987654321',
      initials: 'MA',
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
        <div className="bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-800 w-full max-w-sm overflow-hidden flex flex-col items-center p-6 space-y-6">
          {/* Top Status */}
          <div className="text-center space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-950/80 px-3 py-1 rounded-full border border-blue-800/60">
              VoIP • Tổng đài SmartSales
            </span>
            <p className="text-xs text-slate-400 pt-2">
              {callState === 'ringing'
                ? 'Đang đổ chuông...'
                : callState === 'connected'
                ? `Đang đàm thoại • ${formatTime(seconds)}`
                : 'Đã kết thúc cuộc gọi'}
            </p>
          </div>

          {/* Caller Avatar & Name */}
          <div className="flex flex-col items-center space-y-3">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-blue-500/20">
                {targetCustomer.initials || targetCustomer.name?.substring(0, 2).toUpperCase() || 'MA'}
              </div>
              {callState === 'connected' && (
                <span className="absolute -bottom-1 inset-x-0 flex justify-center">
                  <span className="flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-slate-900"></span>
                  </span>
                </span>
              )}
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-white">{targetCustomer.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{targetCustomer.phone}</p>
            </div>
          </div>

          {/* Wave animation effect when connected */}
          {callState === 'connected' && (
            <div className="flex items-center gap-1.5 h-6">
              {[40, 75, 30, 90, 60, 100, 50, 80, 45, 95].map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-blue-500 rounded-full animate-pulse"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: '0.8s',
                  }}
                />
              ))}
            </div>
          )}

          {/* Live Call Note input */}
          <div className="w-full">
            <input
              type="text"
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="Ghi chú nhanh nội dung cuộc gọi..."
              className="w-full px-3.5 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Call Action Buttons */}
          <div className="w-full grid grid-cols-3 gap-4 pt-2">
            {/* Mute Button */}
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-colors ${
                isMuted ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span className="text-[10px]">{isMuted ? 'Bật mic' : 'Tắt mic'}</span>
            </button>

            {/* Hangup / End Call Button (Big Red) */}
            <button
              type="button"
              onClick={handleEndCall}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
              <span className="text-[10px] font-bold">Kết thúc</span>
            </button>

            {/* Speaker Button */}
            <button
              type="button"
              onClick={() => setIsSpeaker(!isSpeaker)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-colors ${
                isSpeaker ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <span className="text-[10px]">{isSpeaker ? 'Loa ngoài' : 'Tai nghe'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  window.CallModal = CallModal;
})();
