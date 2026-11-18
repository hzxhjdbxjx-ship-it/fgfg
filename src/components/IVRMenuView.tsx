import React, { useState, useEffect } from 'react';
import { Network, ChevronLeft, Volume2, Plus, Trash2, PhoneForwarded, Bot, Check, Play, Square } from 'lucide-react';
import { speechEngine } from '../utils/speech';
import { unlockAudioAndSpeech, playDtmfTone } from '../utils/audio';

interface IVRRoute {
  id: string;
  key: string;
  label: string;
  target: string;
  type: 'agent' | 'transfer' | 'voicemail';
}

const DEFAULT_ROUTES: IVRRoute[] = [
  { id: 'ivr-1', key: '1', label: 'Enterprise Sales', target: 'Marcus Sterling (AI SDR)', type: 'agent' },
  { id: 'ivr-2', key: '2', label: 'Customer Support', target: 'Ava Mitchell (Support AI)', type: 'agent' },
  { id: 'ivr-3', key: '3', label: 'Appointments & Care', target: 'Dr. Elena Rostova (Clinic AI)', type: 'agent' },
  { id: 'ivr-4', key: '0', label: 'Escalation Desk', target: 'Live Human Phone Queue', type: 'transfer' },
];

interface IVRMenuViewProps {
  onBack: () => void;
}

export const IVRMenuView: React.FC<IVRMenuViewProps> = ({ onBack }) => {
  const [greetingText, setGreetingText] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_ivr_greeting');
      if (saved) return saved;
    } catch {}
    return "Thank you for calling RoboVoiceCall. For Enterprise Sales, press 1. For Customer Support, press 2. For Healthcare and Appointment Scheduling, press 3. To speak with a human operator, press 0.";
  });

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const [routes, setRoutes] = useState<IVRRoute[]>(() => {
    try {
      const saved = localStorage.getItem('applet_ivr_routes');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_ROUTES;
  });

  // New Route Modal Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState('4');
  const [newLabel, setNewLabel] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newType, setNewType] = useState<'agent' | 'transfer' | 'voicemail'>('agent');

  // Save to localStorage
  const handleSave = () => {
    try {
      localStorage.setItem('applet_ivr_greeting', greetingText);
      localStorage.setItem('applet_ivr_routes', JSON.stringify(routes));
    } catch {}
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handlePlayGreeting = () => {
    if (isPlayingAudio) {
      speechEngine.stopSpeaking();
      setIsPlayingAudio(false);
      return;
    }

    unlockAudioAndSpeech();
    setIsPlayingAudio(true);
    speechEngine.speak(greetingText, {
      voiceGender: 'female',
      rate: 1.0,
      onEnd: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false)
    });
  };

  const handleTestRoute = (route: IVRRoute) => {
    unlockAudioAndSpeech();
    playDtmfTone(route.key);
    speechEngine.stopSpeaking();
    speechEngine.speak(`Routing key ${route.key} for ${route.label} to ${route.target}`, {
      voiceGender: 'female',
      rate: 1.0
    });
  };

  const handleAddRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newLabel.trim()) return;

    const newRoute: IVRRoute = {
      id: `ivr-${Date.now()}`,
      key: newKey.trim(),
      label: newLabel.trim(),
      target: newTarget.trim() || (newType === 'agent' ? 'AI Voice Agent' : 'Call Center Desk'),
      type: newType
    };

    const updated = [...routes, newRoute];
    setRoutes(updated);
    try {
      localStorage.setItem('applet_ivr_routes', JSON.stringify(updated));
    } catch {}

    setNewLabel('');
    setNewTarget('');
    setNewKey('');
    setShowAddForm(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleDeleteRoute = (id: string) => {
    const updated = routes.filter(r => r.id !== id);
    setRoutes(updated);
    try {
      localStorage.setItem('applet_ivr_routes', JSON.stringify(updated));
    } catch {}
  };

  return (
    <div className="w-full flex flex-col gap-4 pb-8">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Network className="w-5 h-5 text-sky-600" />
          <span>Interactive Voice Response (IVR) Menu</span>
        </h2>

        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Save IVR</span>
        </button>
      </div>

      {savedToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center justify-between shadow-sm animate-fade-in">
          <span>IVR Menu configuration successfully updated & deployed!</span>
          <Check className="w-4 h-4 text-emerald-600" />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Inbound Auto-Attendant Flow</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Routes incoming callers based on DTMF keypad digits to dedicated AI voice personas or transfer queues.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold w-fit">
            ● Active IVR Engine
          </span>
        </div>

        {/* Greeting Prompt */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">Initial Attendant Voice Prompt</label>
            <button
              onClick={handlePlayGreeting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-semibold transition cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isPlayingAudio ? 'Stop Preview' : 'Listen to Prompt'}</span>
            </button>
          </div>
          <textarea
            value={greetingText}
            onChange={(e) => setGreetingText(e.target.value)}
            rows={3}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 outline-none focus:border-sky-500 leading-relaxed font-sans"
            placeholder="Type attendant greeting here..."
          />
        </div>

        {/* DTMF Keypad Routing Nodes */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800">Keypad Touch-Tone Branches ({routes.length})</span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'Cancel' : 'Add Key Route'}</span>
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={handleAddRoute} className="p-4 rounded-xl border border-sky-200 bg-sky-50/60 flex flex-col gap-3">
              <span className="text-xs font-bold text-sky-900">Add Touch-Tone Key Branch</span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label className="text-[11px] text-slate-600 font-semibold block mb-1">Key (0-9, *, #)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="e.g. 4"
                    className="w-full p-2 rounded-lg bg-white border border-slate-300 font-mono font-bold text-center"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] text-slate-600 font-semibold block mb-1">Menu Label</label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Billing & Invoices"
                    className="w-full p-2 rounded-lg bg-white border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600 font-semibold block mb-1">Route Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full p-2 rounded-lg bg-white border border-slate-300 font-medium"
                  >
                    <option value="agent">AI Voice Agent</option>
                    <option value="transfer">Live Transfer</option>
                    <option value="voicemail">Voicemail</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-600 font-semibold block mb-1">Destination Target</label>
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="e.g. Finance AI Agent or +1 800 555 0199"
                  className="w-full p-2 rounded-lg bg-white border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition active:scale-95"
                >
                  Add Branch
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-col gap-2">
            {routes.map((route) => (
              <div
                key={route.id}
                className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 hover:bg-slate-100/70 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-sky-600 text-white font-mono font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    {route.key}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 block truncate">
                      Press {route.key}: {route.label}
                    </span>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                      {route.type === 'agent' ? (
                        <Bot className="w-3 h-3 text-sky-600 shrink-0" />
                      ) : (
                        <PhoneForwarded className="w-3 h-3 text-emerald-600 shrink-0" />
                      )}
                      <span className="truncate">Routes to: {route.target}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestRoute(route)}
                    title={`Test Tone & Route ${route.key}`}
                    className="p-1.5 rounded-md hover:bg-sky-100 text-sky-700 text-xs transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>

                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                    {route.type}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleDeleteRoute(route.id)}
                    className="p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                    title="Remove Route"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

