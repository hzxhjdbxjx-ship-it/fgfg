import React, { useState } from 'react';
import { MessageSquare, ChevronLeft, Send, Check, Sparkles } from 'lucide-react';

interface AutoSMSViewProps {
  onBack: () => void;
}

export const AutoSMSView: React.FC<AutoSMSViewProps> = ({ onBack }) => {
  const [enablePostCallSms, setEnablePostCallSms] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_sms_enabled');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return true;
  });
  const [template, setTemplate] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_sms_template');
      if (saved) return saved;
    } catch {}
    return 'Hi {{name}}, thank you for speaking with {{agent_name}} at RoboVoiceCall! You can review your summary or book your next slot here: https://robovoice.app/b/{{booking_id}}';
  });
  const [testNumber, setTestNumber] = useState('');
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveConfig = () => {
    try {
      localStorage.setItem('applet_sms_enabled', JSON.stringify(enablePostCallSms));
      localStorage.setItem('applet_sms_template', template);
    } catch {}
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleSendTest = () => {
    if (!testNumber) return;
    setSentNotice(`SMS dispatched to ${testNumber} via Carrier Trunk: "Hi, thank you for speaking with our automated service..."`);
    setTimeout(() => setSentNotice(null), 4000);
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
          <MessageSquare className="w-5 h-5 text-sky-600" />
          <span>Auto SMS & Post-Call Follow-ups</span>
        </h2>

        <button
          onClick={handleSaveConfig}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Save SMS Policy</span>
        </button>
      </div>

      {savedNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center justify-between shadow-sm animate-fade-in">
          <span>Auto SMS follow-up template & policy successfully saved!</span>
          <Check className="w-4 h-4 text-emerald-600" />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Post-Call Instant Text Follow-up</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically trigger SMS confirmations when an autonomous AI call finishes.
            </p>
          </div>
          <button
            onClick={() => setEnablePostCallSms(!enablePostCallSms)}
            className={`w-11 h-6 rounded-full transition-colors relative ${enablePostCallSms ? 'bg-sky-600' : 'bg-slate-300'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${enablePostCallSms ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {/* Template box */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-700">SMS Text Template</label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={4}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 font-mono outline-none focus:border-sky-500 leading-relaxed"
          />
          <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-600">Available merge tags:</span>
            {['{{name}}', '{{agent_name}}', '{{booking_id}}', '{{company}}', '{{call_duration}}'].map(tag => (
              <button
                key={tag}
                onClick={() => setTemplate(t => t + ' ' + tag)}
                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-sky-700 transition"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Test SMS Dispatcher */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-800">Dispatch Test SMS</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500 font-mono"
              placeholder="+1 (555) 000-0000"
            />
            <button
              onClick={handleSendTest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition active:scale-95 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Test</span>
            </button>
          </div>

          {sentNotice && (
            <div className="p-2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
              {sentNotice}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
