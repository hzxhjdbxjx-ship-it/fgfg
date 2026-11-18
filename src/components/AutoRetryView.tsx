import React, { useState } from 'react';
import { RotateCw, ChevronLeft, Check, ShieldAlert } from 'lucide-react';

interface AutoRetryViewProps {
  onBack: () => void;
}

export const AutoRetryView: React.FC<AutoRetryViewProps> = ({ onBack }) => {
  const [retryOnBusy, setRetryOnBusy] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_retry_busy');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return true;
  });
  const [retryOnVoicemail, setRetryOnVoicemail] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_retry_vm');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return false;
  });
  const [retryOnNoAnswer, setRetryOnNoAnswer] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_retry_no_answer');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return true;
  });
  const [maxAttempts, setMaxAttempts] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_retry_max_attempts');
      if (saved !== null) return Number(saved);
    } catch {}
    return 3;
  });
  const [intervalMinutes, setIntervalMinutes] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_retry_interval');
      if (saved !== null) return Number(saved);
    } catch {}
    return 15;
  });
  const [savedToast, setSavedToast] = useState(false);

  const handleSave = () => {
    try {
      localStorage.setItem('applet_retry_busy', JSON.stringify(retryOnBusy));
      localStorage.setItem('applet_retry_vm', JSON.stringify(retryOnVoicemail));
      localStorage.setItem('applet_retry_no_answer', JSON.stringify(retryOnNoAnswer));
      localStorage.setItem('applet_retry_max_attempts', String(maxAttempts));
      localStorage.setItem('applet_retry_interval', String(intervalMinutes));
    } catch {}
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  return (
    <div className="w-full flex flex-col gap-4 pb-8">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <RotateCw className="w-5 h-5 text-sky-600" />
          <span>Auto Retry Rules & Dial Cadence</span>
        </h2>

        <div className="w-12" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Unanswered Call Automation</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure automatic redial rules when a prospect or lead is busy or does not answer.
          </p>
        </div>

        {/* Triggers toggles */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">Retry on Line Busy / SIP 486</span>
              <span className="text-[11px] text-slate-500">Automatically re-queues call if user is engaged</span>
            </div>
            <button
              onClick={() => setRetryOnBusy(!retryOnBusy)}
              className={`w-11 h-6 rounded-full transition-colors relative ${retryOnBusy ? 'bg-sky-600' : 'bg-slate-300'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${retryOnBusy ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">Retry on No Answer / SIP 408</span>
              <span className="text-[11px] text-slate-500">Re-queue if phone rings over 30s without pickup</span>
            </div>
            <button
              onClick={() => setRetryOnNoAnswer(!retryOnNoAnswer)}
              className={`w-11 h-6 rounded-full transition-colors relative ${retryOnNoAnswer ? 'bg-sky-600' : 'bg-slate-300'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${retryOnNoAnswer ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">Retry on Answering Machine (AMD)</span>
              <span className="text-[11px] text-slate-500">If AI detects voicemail, redial after leaving message</span>
            </div>
            <button
              onClick={() => setRetryOnVoicemail(!retryOnVoicemail)}
              className={`w-11 h-6 rounded-full transition-colors relative ${retryOnVoicemail ? 'bg-sky-600' : 'bg-slate-300'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${retryOnVoicemail ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-700">Maximum Retry Attempts</span>
              <span className="font-mono text-sky-600">{maxAttempts} attempts</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className="accent-sky-600 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-700">Cooldown Between Retries</span>
              <span className="font-mono text-sky-600">{intervalMinutes} minutes</span>
            </div>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              className="accent-sky-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {savedToast && (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <Check className="w-4 h-4" /> Changes saved successfully!
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition active:scale-95"
          >
            Save Auto-Retry Policy
          </button>
        </div>
      </div>
    </div>
  );
};
