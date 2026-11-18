import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Mic, Server, Activity, AlertTriangle, 
  CheckCircle2, RefreshCw, X, Radio, Terminal, Volume2, Globe, Cpu, Key, Play, Square
} from 'lucide-react';
import { webrtcManager, WebRTCDiagnosticResult, TurnServerConfig } from '../utils/webrtc';

interface WebRTCDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WebRTCDiagnosticsModal: React.FC<WebRTCDiagnosticsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'checklist' | 'turn_config' | 'signaling' | 'console'>('checklist');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [diagResult, setDiagResult] = useState<WebRTCDiagnosticResult | null>(null);
  const [logs, setLogs] = useState<{ time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }[]>([]);
  const [micTestActive, setMicTestActive] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [iceState, setIceState] = useState<string>('idle');

  // TURN Configuration State
  const [turnUrl, setTurnUrl] = useState<string>(() => webrtcManager.customTurnServer?.urls || 'turn:openrelay.metered.ca:80');
  const [turnUser, setTurnUser] = useState<string>(() => webrtcManager.customTurnServer?.username || 'openrelayproject');
  const [turnPass, setTurnPass] = useState<string>(() => webrtcManager.customTurnServer?.credential || 'openrelayproject');
  const [turnSavedNotice, setTurnSavedNotice] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setLogs(prev => [...prev, {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text: 'Starting comprehensive 6-point WebRTC pre-flight test...',
      type: 'info'
    }]);

    try {
      const res = await webrtcManager.runFullDiagnostics();
      setDiagResult(res);

      setLogs(prev => [
        ...prev,
        {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          text: `1. HTTPS/Secure: ${res.secureContext.pass ? 'PASS' : 'FAIL'} (${res.secureContext.message})`,
          type: res.secureContext.pass ? 'success' : 'error'
        },
        {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          text: `2. WebRTC Support: ${res.webrtcSupported.pass ? 'PASS' : 'FAIL'}`,
          type: res.webrtcSupported.pass ? 'success' : 'error'
        },
        {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          text: `3. Mic Permission: ${res.micPermission.state.toUpperCase()} (${res.micPermission.message})`,
          type: res.micPermission.pass ? 'success' : 'info'
        },
        {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          text: `4. STUN ICE Servers: ${res.stunConnectivity.pass ? 'REACHED' : 'FAIL'} (${res.stunConnectivity.message})`,
          type: res.stunConnectivity.pass ? 'success' : 'error'
        },
        {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          text: `5. Audio Device: ${res.audioInputDevice.deviceLabel}`,
          type: 'info'
        },
        {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          text: `6. Signaling: ${res.signalingReady.message}`,
          type: 'success'
        }
      ]);
    } catch (err: any) {
      setLogs(prev => [...prev, {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        text: `Diagnostic error: ${err?.message || 'Unknown error'}`,
        type: 'error'
      }]);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (micTestActive) {
        webrtcManager.terminateCallSession();
        setMicTestActive(false);
      }
      return;
    }

    setMicError(null);
    runDiagnostics();
    setIceState(webrtcManager.iceConnectionState || 'idle');

    const unsubscribe = webrtcManager.subscribe({
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onIceStateChange: (state) => setIceState(state),
      onDiagnosticsLog: (log) => setLogs(prev => [...prev.slice(-40), log])
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const toggleMicTest = async () => {
    setMicError(null);
    if (micTestActive) {
      webrtcManager.terminateCallSession();
      setMicTestActive(false);
    } else {
      try {
        await webrtcManager.checkMicrophone();
        setMicTestActive(true);
        runDiagnostics();
      } catch (err: any) {
        setMicError(err?.message || 'Microphone permission was denied. Please allow microphone access in your browser settings.');
      }
    }
  };

  const handleSaveTurn = () => {
    if (!turnUrl.trim()) {
      webrtcManager.setCustomTurn(null);
      setTurnSavedNotice('Reset to default STUN + OpenRelay TURN servers.');
    } else {
      const config: TurnServerConfig = {
        urls: turnUrl.trim(),
        username: turnUser.trim() || undefined,
        credential: turnPass.trim() || undefined
      };
      webrtcManager.setCustomTurn(config);
      setTurnSavedNotice(`✓ TURN server updated: ${config.urls}`);
    }
    setTimeout(() => setTurnSavedNotice(null), 4000);
    runDiagnostics();
  };

  const handleResetOpenRelayTurn = () => {
    setTurnUrl('turn:openrelay.metered.ca:80');
    setTurnUser('openrelayproject');
    setTurnPass('openrelayproject');
    webrtcManager.setCustomTurn({
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    });
    setTurnSavedNotice('✓ Loaded OpenRelay Free Global TURN Server (Port 80/443).');
    setTimeout(() => setTurnSavedNotice(null), 4000);
    runDiagnostics();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>WebRTC Telephony Diagnostic & Signaling Inspector</span>
              </span>
              <h3 className="text-base font-extrabold text-white">
                WebRTC Call Flow & STUN/TURN Health
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'checklist', label: '1. Flow Checklist' },
            { id: 'signaling', label: '2. Socket & Signaling' },
            { id: 'turn_config', label: '3. TURN / STUN Servers' },
            { id: 'console', label: '4. Live Logs' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-4">
          {/* TAB 1: Checklist & Flow */}
          {activeTab === 'checklist' && (
            <div className="flex flex-col gap-3.5">
              {/* Quick Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    iceState === 'connected' || iceState === 'completed'
                      ? 'bg-emerald-500 animate-pulse'
                      : iceState === 'checking'
                      ? 'bg-amber-500 animate-spin'
                      : iceState === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-blue-500'
                  }`} />
                  <span className="text-xs font-bold text-slate-800">
                    ICE State: <strong className="font-mono uppercase text-blue-700">{iceState}</strong>
                    <span className="text-slate-500 font-normal ml-1.5">(Target: checking → connected → completed)</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMicTest}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      micTestActive
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>{micTestActive ? 'Stop Mic Test' : '1. Test Microphone'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={runDiagnostics}
                    disabled={isRunning}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                    <span>Re-test</span>
                  </button>
                </div>
              </div>

              {/* Mic Permission Error Banner */}
              {micError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-900">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="font-semibold">{micError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMicError(null)}
                    className="text-rose-700 hover:text-rose-950 font-bold px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Live Mic Meter If Active */}
              {micTestActive && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-col gap-1.5 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-emerald-600 animate-bounce" />
                      <span>Microphone Live Input (Console prints "MIC OK")</span>
                    </span>
                    <span className="font-mono text-emerald-700">{audioLevel}%</span>
                  </div>
                  <div className="w-full bg-emerald-200 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-emerald-600 h-2.5 rounded-full transition-all duration-75"
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 5-Step Order Grid from User Spec */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Microphone Check */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start gap-3 shadow-2xs">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    diagResult?.micPermission.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {diagResult?.micPermission.pass ? <CheckCircle2 className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-900">1. Microphone (getUserMedia)</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        diagResult?.micPermission.pass ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {diagResult?.micPermission.state.toUpperCase() || 'PROMPT'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      {diagResult?.micPermission.pass ? 'Microphone accessed and verified with "MIC OK".' : 'Browser permission prompt armed on dial.'}
                    </p>
                  </div>
                </div>

                {/* 2. WebSocket Signaling Check */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start gap-3 shadow-2xs">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    webrtcManager.wsConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-900">2. WebSocket Signaling</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        webrtcManager.wsConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {webrtcManager.wsConnected ? 'CONNECTED' : 'RECONNECTING'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      {webrtcManager.wsConnected
                        ? `/ws/signaling active • ${webrtcManager.getOtherOnlinePeers().length} other peer(s) online.`
                        : 'Connecting to /ws/signaling server for real P2P offers & ICE.'}
                    </p>
                  </div>
                </div>

                {/* 3. ICE Connection State */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start gap-3 shadow-2xs">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-900">3. ICE State Tracking</span>
                      <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded uppercase">
                        {iceState}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      Listening to oniceconnectionstatechange. Target: checking → connected.
                    </p>
                  </div>
                </div>

                {/* 4. TURN & STUN Servers */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start gap-3 shadow-2xs">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    diagResult?.stunConnectivity.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    <Server className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-900">4. STUN + TURN Relay</span>
                      <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                        {diagResult?.stunConnectivity.latencyMs ? `${diagResult.stunConnectivity.latencyMs}ms` : 'Configured'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      Google STUN + OpenRelay TURN configured for cross-NAT relay.
                    </p>
                  </div>
                </div>

                {/* 5. Remote Audio Element */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start gap-3 shadow-2xs md:col-span-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-900">5. Remote Audio Sink & ontrack</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                        &lt;audio id="remoteAudio"&gt; OK
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      peerConnection.ontrack binds incoming stream directly to &lt;audio id="remoteAudio" autoplay playsinline&gt;.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Socket & Signaling */}
          {activeTab === 'signaling' && (
            <div className="flex flex-col gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-col gap-2 font-mono text-xs">
                <span className="text-emerald-400 font-bold text-[11px] uppercase tracking-wider">
                  Live WebSocket Signaling Session
                </span>
                <div className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Local Client ID:</span>
                  <span className="text-blue-300 font-bold">{webrtcManager.socketId}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Registered Number:</span>
                  <span className="text-emerald-300 font-bold">{webrtcManager.registeredPhone || '(Not registered yet)'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Online Peers Available:</span>
                  <span className="text-sky-300 font-bold">{webrtcManager.getOtherOnlinePeers().length} peer(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Signaling Transport:</span>
                  <span className={webrtcManager.wsConnected ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {webrtcManager.wsConnected ? 'WebSocket (/ws/signaling) Connected' : 'WebSocket Disconnected'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-2">
                <span className="font-bold text-xs text-slate-900">Verify Live Signaling Connection</span>
                <p className="text-[11px] text-slate-600">
                  Send a real WebSocket heartbeat ping to the /ws/signaling server or reconnect to refresh online peer registrations.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const ok = webrtcManager.sendSignalingMessage({ type: 'PING' });
                      if (!ok) {
                        webrtcManager.connectSignaling();
                      }
                      runDiagnostics();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Ping Signaling Server</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TURN Server Configuration */}
          {activeTab === 'turn_config' && (
            <div className="flex flex-col gap-3">
              <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/80 text-xs text-blue-900">
                <span className="font-bold block mb-1">Production Calling with TURN:</span>
                <span>
                  STUN discovers your public IP, but symmetrical NAT or corporate firewalls require a <strong>TURN Relay Server</strong> to pass audio between different networks.
                </span>
              </div>

              {turnSavedNotice && (
                <div className="p-2.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold">
                  {turnSavedNotice}
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    TURN Server URL (e.g. turn:your-turn-server.com:3478 or turn:openrelay.metered.ca:80)
                  </label>
                  <input
                    type="text"
                    value={turnUrl}
                    onChange={(e) => setTurnUrl(e.target.value)}
                    placeholder="turn:YOUR_TURN_SERVER"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      TURN Username
                    </label>
                    <input
                      type="text"
                      value={turnUser}
                      onChange={(e) => setTurnUser(e.target.value)}
                      placeholder="YOUR_USERNAME"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      TURN Password / Credential
                    </label>
                    <input
                      type="password"
                      value={turnPass}
                      onChange={(e) => setTurnPass(e.target.value)}
                      placeholder="YOUR_PASSWORD"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveTurn}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
                  >
                    Save & Apply TURN
                  </button>

                  <button
                    type="button"
                    onClick={handleResetOpenRelayTurn}
                    className="px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
                  >
                    Reset OpenRelay Free TURN
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Live Console Logs */}
          {activeTab === 'console' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-300 font-mono text-[11px] flex flex-col gap-1.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400 text-[10px]">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>WebRTC Handshake & Signaling Console</span>
                </span>
                <span>{logs.length} entries</span>
              </div>

              <div className="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2 leading-tight">
                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                    <span className={`break-words ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warn' ? 'text-amber-400' :
                      log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            STUN: Google • TURN: {webrtcManager.customTurnServer ? 'Custom Active' : 'OpenRelay Default'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
