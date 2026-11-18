import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, ShieldCheck, AlertCircle } from 'lucide-react';
import { IncomingCallOffer } from '../utils/webrtc';

export interface ActiveIncomingCallState {
  callId: string;
  peerName: string;
  peerNumber: string;
  durationSeconds: number;
  isMuted: boolean;
  speakerOn: boolean;
  micLevel: number;
  iceState: string;
}

interface IncomingCallOverlayProps {
  incomingOffer: IncomingCallOffer | null;
  activeCall: ActiveIncomingCallState | null;
  callError: string | null;
  onDismissError: () => void;
  onAnswer: () => void;
  onDecline: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
}

export const IncomingCallOverlay: React.FC<IncomingCallOverlayProps> = ({
  incomingOffer,
  activeCall,
  callError,
  onDismissError,
  onAnswer,
  onDecline,
  onEndCall,
  onToggleMute,
  onToggleSpeaker
}) => {
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Persistent global WebRTC remote audio sink */}
      <audio id="globalRemoteAudio" autoPlay playsInline className="hidden" />

      {/* Error Toast if answering/mic failed */}
      {callError && !incomingOffer && !activeCall && (
        <div className="fixed top-14 inset-x-4 sm:left-auto sm:right-6 sm:w-96 z-50 p-3.5 rounded-xl bg-rose-950 border border-rose-500 text-rose-100 shadow-2xl flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block text-white">Call Audio Error</span>
            <span className="text-rose-200">{callError}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-rose-300 hover:text-white font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Full-Screen Incoming Call Screen */}
      {incomingOffer && !activeCall && (
        <div className="fixed inset-0 z-50 bg-[#07152D]/95 backdrop-blur-md flex flex-col items-center justify-between p-6 sm:p-10 text-white">
          <div className="w-full max-w-sm flex items-center justify-between pt-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Original Live Call</span>
            </span>
            <span className="text-xs font-mono text-sky-300">WebRTC Audio</span>
          </div>

          <div className="flex flex-col items-center text-center my-auto">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-4xl font-extrabold shadow-2xl border-4 border-white/25 mb-6 animate-pulse">
              {(incomingOffer.callerName || incomingOffer.callerNumber || 'C').charAt(0).toUpperCase()}
            </div>
            <span className="text-xs uppercase tracking-widest text-sky-300 font-bold mb-1">
              Incoming In-App Call
            </span>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">
              {incomingOffer.callerName || 'Incoming Caller'}
            </h2>
            <p className="text-lg font-mono text-sky-200 mt-1">
              {incomingOffer.callerNumber}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              To your number: <span className="font-mono text-slate-200">{incomingOffer.targetNumber}</span>
            </p>

            {callError && (
              <div className="mt-4 p-2.5 rounded-lg bg-rose-900/80 border border-rose-400/50 text-rose-100 text-xs max-w-xs">
                {callError}
              </div>
            )}
          </div>

          <div className="w-full max-w-xs flex items-center justify-around pb-6">
            <button
              type="button"
              onClick={onDecline}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl transition active:scale-95">
                <PhoneOff className="w-7 h-7" />
              </div>
              <span className="text-xs font-bold text-rose-200 uppercase tracking-wider">Decline</span>
            </button>

            <button
              type="button"
              onClick={onAnswer}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-xl transition active:scale-95 animate-bounce">
                <Phone className="w-7 h-7 fill-current" />
              </div>
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Answer</span>
            </button>
          </div>
        </div>
      )}

      {/* Full-Screen Active Connected Call Screen (for answered inbound calls) */}
      {activeCall && (
        <div className="fixed inset-0 z-50 bg-[#0F131C] text-white flex flex-col items-center justify-between p-6 sm:p-10">
          <div className="w-full max-w-sm flex items-center justify-between text-xs text-slate-300 font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE ORIGINAL CALL</span>
            </span>
            <span className="text-slate-400 uppercase">ICE: {activeCall.iceState}</span>
          </div>

          <div className="flex flex-col items-center text-center my-auto">
            <div className="w-28 h-28 rounded-full bg-[#8d134a] flex items-center justify-center text-4xl font-bold shadow-2xl border-4 border-white/15 mb-5">
              {(activeCall.peerName || activeCall.peerNumber || 'C').charAt(0).toUpperCase()}
            </div>
            <h2 className="text-3xl font-bold text-white">{activeCall.peerName}</h2>
            <p className="text-base font-mono text-slate-300 mt-1">{activeCall.peerNumber}</p>
            <p className="text-lg font-mono font-bold text-emerald-400 mt-3 tabular-nums">
              {formatDuration(activeCall.durationSeconds)}
            </p>

            {/* Real Mic Audio Meter */}
            <div className="mt-4 w-48 flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${activeCall.isMuted ? 0 : activeCall.micLevel}%` }}
                />
              </div>
              <span className="w-7 text-right">{activeCall.isMuted ? 'MUTE' : `${activeCall.micLevel}%`}</span>
            </div>
          </div>

          <div className="w-full max-w-xs bg-[#1b202c] border border-slate-800 rounded-3xl p-5 flex flex-col items-center gap-5 shadow-2xl">
            <div className="flex items-center justify-around w-full">
              <button
                type="button"
                onClick={onToggleMute}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
                  activeCall.isMuted ? 'bg-white text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}>
                  {activeCall.isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </div>
                <span className="text-xs text-slate-300">{activeCall.isMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleSpeaker}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
                  activeCall.speakerOn ? 'bg-white text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}>
                  {activeCall.speakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </div>
                <span className="text-xs text-slate-300">Speaker</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onEndCall}
              className="w-40 h-14 rounded-full bg-[#f26b5b] hover:bg-[#ea4335] text-slate-950 flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer"
              title="End Call"
            >
              <Phone className="w-6 h-6 fill-current rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
