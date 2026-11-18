import React, { useState, useEffect } from 'react';
import { 
  PhoneCall, PhoneOff, X, CheckCircle2, Shield, Globe, Terminal, 
  Settings, Key, Radio, Zap, Activity, Volume2, Cpu, Server
} from 'lucide-react';
import { 
  vonageVoiceManager, 
  DEFAULT_VONAGE_APP_ID, 
  DEFAULT_VONAGE_VIRTUAL_NUMBER, 
  DEFAULT_VONAGE_API_KEY,
  VonageLogEvent
} from '../utils/vonage';

interface VonageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEngine: 'webrtc' | 'agora' | 'vonage';
  onEngineSelect: (engine: 'webrtc' | 'agora' | 'vonage') => void;
}

export const VonageSettingsModal: React.FC<VonageSettingsModalProps> = ({
  isOpen,
  onClose,
  currentEngine,
  onEngineSelect
}) => {
  const [appId, setAppId] = useState<string>(() => vonageVoiceManager.config.applicationId);
  const [virtualNumber, setVirtualNumber] = useState<string>(() => vonageVoiceManager.config.virtualNumber);
  const [apiKey, setApiKey] = useState<string>(() => vonageVoiceManager.config.apiKey);
  const [voiceName, setVoiceName] = useState<string>(() => vonageVoiceManager.config.voiceName);
  const [testNumber, setTestNumber] = useState<string>('+1 (555) 019-2834');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState<boolean>(() => vonageVoiceManager.isConnected);
  const [logs, setLogs] = useState<VonageLogEvent[]>(() => vonageVoiceManager.logs);
  const [callStatus, setCallStatus] = useState<string>(() => vonageVoiceManager.currentSession?.status || 'idle');

  useEffect(() => {
    if (isOpen) {
      setAppId(vonageVoiceManager.config.applicationId);
      setVirtualNumber(vonageVoiceManager.config.virtualNumber);
      setApiKey(vonageVoiceManager.config.apiKey);
      setVoiceName(vonageVoiceManager.config.voiceName);
      setIsCalling(vonageVoiceManager.isConnected);
      setCallStatus(vonageVoiceManager.currentSession?.status || 'idle');
      setLogs([...vonageVoiceManager.logs]);

      vonageVoiceManager.setCallbacks({
        onStateChange: (status) => {
          setCallStatus(status);
          setIsCalling(status !== 'idle' && status !== 'completed' && status !== 'failed');
        },
        onLog: (newLog) => {
          setLogs(prev => [...prev.slice(-35), newLog]);
        }
      });
    }
  }, [isOpen]);

  const handleSave = () => {
    vonageVoiceManager.saveConfig({
      applicationId: appId,
      virtualNumber,
      apiKey,
      voiceName
    });
    setSaveNotice('✓ Vonage Voice API settings saved successfully.');
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleResetDefaults = () => {
    setAppId(DEFAULT_VONAGE_APP_ID);
    setVirtualNumber(DEFAULT_VONAGE_VIRTUAL_NUMBER);
    setApiKey(DEFAULT_VONAGE_API_KEY);
    setVoiceName('Russell (en-US)');
    vonageVoiceManager.saveConfig({
      applicationId: DEFAULT_VONAGE_APP_ID,
      virtualNumber: DEFAULT_VONAGE_VIRTUAL_NUMBER,
      apiKey: DEFAULT_VONAGE_API_KEY,
      voiceName: 'Russell (en-US)'
    });
    setSaveNotice('✓ Reset to Vonage Voice default demo credentials.');
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleTestCall = async () => {
    if (isCalling) {
      await vonageVoiceManager.endCall();
      setIsCalling(false);
    } else {
      setIsCalling(true);
      vonageVoiceManager.saveConfig({ applicationId: appId, virtualNumber, apiKey, voiceName });
      await vonageVoiceManager.initiateCall({
        targetNumber: testNumber,
        targetName: 'Test Phone Subscriber'
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <PhoneCall className="w-5 h-5 text-purple-300 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>Vonage Voice API (Nexmo Telecom)</span>
              </span>
              <h3 className="text-base font-extrabold text-white">
                Vonage Voice Gateway & PSTN Bridge
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Engine Switcher */}
        <div className="bg-slate-100 border-b border-slate-200 p-3 sm:px-5 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-700">Active Voice Engine:</span>
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-300 flex-wrap">
            <button
              type="button"
              onClick={() => onEngineSelect('vonage')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                currentEngine === 'vonage'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Vonage Voice API</span>
            </button>

            <button
              type="button"
              onClick={() => onEngineSelect('agora')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                currentEngine === 'agora'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-sky-300" />
              <span>Agora RTC</span>
            </button>

            <button
              type="button"
              onClick={() => onEngineSelect('webrtc')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                currentEngine === 'webrtc'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-blue-300" />
              <span>WebRTC P2P</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-4">
          {saveNotice && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveNotice}</span>
            </div>
          )}

          {/* Vonage Live Status Card */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-col gap-2 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Call Leg Status:</span>
              <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                callStatus === 'answered' || callStatus === 'in_progress'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : callStatus === 'ringing' || callStatus === 'started'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-slate-700 text-slate-300'
              }`}>
                {callStatus}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Caller ID (LVN):</span>
              <span className="text-purple-300 font-bold">{virtualNumber || DEFAULT_VONAGE_VIRTUAL_NUMBER}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">PSTN Codec:</span>
              <span className="text-emerald-400 font-bold">G.711u / Opus HD (Rate: $0.00/min • Free VoIP)</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Active Call UUID:</span>
              <span className="text-slate-300 text-[10px] truncate max-w-[260px]">
                {vonageVoiceManager.currentSession?.callUuid || 'No active call leg'}
              </span>
            </div>
          </div>

          {/* Vonage Inputs */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Vonage Application ID</span>
                <span className="text-[10px] text-slate-400 font-normal">From Vonage Developer Dashboard</span>
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="e.g. 9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Virtual Number (From LVN)
                </label>
                <input
                  type="text"
                  value={virtualNumber}
                  onChange={(e) => setVirtualNumber(e.target.value)}
                  placeholder="+1 (201) 555-0199"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Vonage TTS Voice Model
                </label>
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="Russell (en-US)">Russell (en-US, Natural Male)</option>
                  <option value="Kimberly (en-US)">Kimberly (en-US, Warm Female)</option>
                  <option value="Amy (en-GB)">Amy (en-GB, British)</option>
                  <option value="Aditi (en-IN)">Aditi (en-IN, Indian English)</option>
                  <option value="Brian (en-GB)">Brian (en-GB, Crisp Male)</option>
                </select>
              </div>
            </div>

            {/* Test Call Dial Field */}
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-purple-700" />
                <span>Test Outbound Vonage Call to Real Phone</span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="flex-1 px-3 py-2 text-xs font-mono border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                />
                <button
                  type="button"
                  onClick={handleTestCall}
                  className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                    isCalling
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-purple-700 hover:bg-purple-600 text-white'
                  }`}
                >
                  {isCalling ? (
                    <>
                      <PhoneOff className="w-3.5 h-3.5" />
                      <span>Hang Up</span>
                    </>
                  ) : (
                    <>
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Test Call</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs transition cursor-pointer"
              >
                Save Vonage Settings
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer ml-auto"
              >
                Reset Demo Key
              </button>
            </div>
          </div>

          {/* Live Vonage Telemetry & NCCO Log */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-300 font-mono text-[10px] flex flex-col gap-1">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
                <Terminal className="w-3.5 h-3.5 text-purple-400" />
                <span>Vonage NCCO & PSTN Gateway Log</span>
              </span>
              <span>{logs.length} entries</span>
            </div>

            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic py-2">
                  Vonage Voice Gateway ready. Click "Test Call" or place a call from the dialer.
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                    <span className={`break-words ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warn' ? 'text-amber-400' :
                      log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Provider: Vonage Voice API (Nexmo Telecom) • Global PSTN & SIP
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
