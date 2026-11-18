import React, { useState, useEffect } from 'react';
import { 
  Radio, X, CheckCircle2, RefreshCw, Key, Globe, Shield, Activity, 
  Volume2, PhoneCall, PhoneOff, Terminal, Zap, Server
} from 'lucide-react';
import { agoraVoiceManager, DEFAULT_AGORA_APP_ID, DEFAULT_AGORA_CHANNEL } from '../utils/agora';

interface AgoraSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEngineSelect?: (engine: 'webrtc' | 'agora' | 'vonage') => void;
  currentEngine: 'webrtc' | 'agora' | 'vonage';
}

export const AgoraSettingsModal: React.FC<AgoraSettingsModalProps> = ({
  isOpen,
  onClose,
  onEngineSelect,
  currentEngine
}) => {
  const [appId, setAppId] = useState<string>(() => agoraVoiceManager.appId);
  const [channel, setChannel] = useState<string>(() => agoraVoiceManager.channel);
  const [token, setToken] = useState<string>(() => agoraVoiceManager.token);
  const [isConnected, setIsConnected] = useState<boolean>(() => agoraVoiceManager.isConnected);
  const [connState, setConnState] = useState<string>(() => agoraVoiceManager.connectionState);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }[]>([]);

  useEffect(() => {
    if (isOpen) {
      setAppId(agoraVoiceManager.appId);
      setChannel(agoraVoiceManager.channel);
      setToken(agoraVoiceManager.token);
      setIsConnected(agoraVoiceManager.isConnected);
      setConnState(agoraVoiceManager.connectionState);

      agoraVoiceManager.setCallbacks({
        onStateChange: (state) => {
          setConnState(state);
          setIsConnected(state === 'CONNECTED');
        },
        onAudioLevel: (lvl) => setAudioLevel(lvl),
        onLog: (log) => setLogs(prev => [...prev.slice(-30), log])
      });
    }
  }, [isOpen]);

  const handleSave = () => {
    agoraVoiceManager.saveConfig({ appId, channel, token });
    setSaveNotice('✓ Agora configuration saved successfully.');
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleResetDefault = () => {
    setAppId(DEFAULT_AGORA_APP_ID);
    setChannel(DEFAULT_AGORA_CHANNEL);
    setToken('');
    agoraVoiceManager.saveConfig({
      appId: DEFAULT_AGORA_APP_ID,
      channel: DEFAULT_AGORA_CHANNEL,
      token: ''
    });
    setSaveNotice('✓ Reset to Agora Global Voice Demo App ID.');
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleTestChannel = async () => {
    setConnectionError(null);
    if (isConnected) {
      setIsTesting(true);
      await agoraVoiceManager.leaveVoiceChannel();
      setIsTesting(false);
    } else {
      setIsTesting(true);
      try {
        agoraVoiceManager.saveConfig({ appId, channel, token });
        await agoraVoiceManager.joinVoiceChannel({ channel });
      } catch (err: any) {
        setConnectionError(`Agora Connection Failed: ${err?.message || err}. Check microphone access, App ID, or token.`);
      } finally {
        setIsTesting(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-800 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Radio className="w-5 h-5 text-sky-300 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>Agora SD-RTN™ Voice Gateway</span>
              </span>
              <h3 className="text-base font-extrabold text-white">
                Agora Voice Engine Configuration
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Engine Switcher Row */}
        <div className="bg-slate-100 border-b border-slate-200 p-3 sm:px-5 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-700">Active Calling Engine:</span>
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-300">
            <button
              type="button"
              onClick={() => onEngineSelect?.('webrtc')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                currentEngine === 'webrtc'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>WebRTC P2P</span>
            </button>

            <button
              type="button"
              onClick={() => onEngineSelect?.('agora')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                currentEngine === 'agora'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Agora RTC</span>
            </button>

            <button
              type="button"
              onClick={() => onEngineSelect?.('vonage')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                currentEngine === 'vonage'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5 text-purple-300" />
              <span>Vonage Voice</span>
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

          {connectionError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold flex items-center justify-between gap-2">
              <span>{connectionError}</span>
              <button
                type="button"
                onClick={() => setConnectionError(null)}
                className="text-rose-700 hover:text-rose-950 font-bold px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Connection Status Card */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-col gap-2 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Connection State:</span>
              <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                connState === 'CONNECTED'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : connState === 'CONNECTING'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-slate-700 text-slate-300'
              }`}>
                {connState}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Channel Name:</span>
              <span className="text-sky-300 font-bold">{channel || DEFAULT_AGORA_CHANNEL}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Agora UID:</span>
              <span className="text-slate-200">{agoraVoiceManager.currentUid || 'Not joined'}</span>
            </div>

            {isConnected && (
              <div className="mt-1 pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mic Level:</span>
                </span>
                <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Configuration Inputs */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Agora App ID</span>
                <span className="text-[10px] text-slate-400 font-normal">From Agora Console</span>
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="Paste your 32-character Agora App ID"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="e.g. robovoice-live"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>RTC Token</span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Leave blank for test mode"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Save Agora Config
              </button>

              <button
                type="button"
                onClick={handleTestChannel}
                disabled={isTesting}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                  isConnected
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                } disabled:opacity-50`}
              >
                {isConnected ? (
                  <>
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>Leave Agora Channel</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>Test Join Channel</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetDefault}
                className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer ml-auto"
              >
                Reset Demo AppID
              </button>
            </div>
          </div>

          {/* Live Agora Console Output */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-300 font-mono text-[10px] flex flex-col gap-1">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                <span>Agora RTC Live Telemetry Log</span>
              </span>
              <span>{logs.length} entries</span>
            </div>

            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic py-2">
                  Agora ready. Click "Test Join Channel" or start a call with Agora engine active.
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
            Protocol: Agora SD-RTN™ (Ultra-low latency Voice)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
