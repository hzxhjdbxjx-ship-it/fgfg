import React, { useState, useEffect } from 'react';
import { CallLog, VoiceAgent, TranscriptMessage } from '../types';
import { speechEngine } from '../utils/speech';
import { unlockAudioAndSpeech } from '../utils/audio';
import { 
  FileText, Search, Filter, Play, Pause, Download, Copy, Check, 
  ExternalLink, ArrowUpRight, ArrowDownLeft, Sparkles, X, Volume2, Clock, DollarSign
} from 'lucide-react';

interface CallLogsProps {
  calls: CallLog[];
  agents: VoiceAgent[];
  activeInspectCall: CallLog | null;
  onSelectCall: (call: CallLog | null) => void;
  onNavigateCall?: () => void;
}

export const CallLogs: React.FC<CallLogsProps> = ({
  calls,
  agents,
  activeInspectCall,
  onSelectCall,
  onNavigateCall
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDisposition, setFilterDisposition] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  // Audio Playback simulation states
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentPlaybackIndex, setCurrentPlaybackIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Stop audio if modal is closed
  useEffect(() => {
    if (!activeInspectCall) {
      speechEngine.stopSpeaking();
      setIsPlayingAudio(false);
      setCurrentPlaybackIndex(0);
    }
  }, [activeInspectCall]);

  // Filtered calls
  const filteredCalls = calls.filter((c) => {
    const matchesSearch = 
      c.callerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.callerNumber.includes(searchTerm) ||
      c.summary.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDisposition = filterDisposition === 'all' || c.disposition.toLowerCase() === filterDisposition.toLowerCase();
    const matchesAgent = filterAgent === 'all' || c.agentId === filterAgent;
    return matchesSearch && matchesDisposition && matchesAgent;
  });

  // Play audio session simulation turn by turn
  const handleTogglePlayback = (call: CallLog) => {
    if (isPlayingAudio) {
      speechEngine.stopSpeaking();
      setIsPlayingAudio(false);
      return;
    }

    unlockAudioAndSpeech();
    setIsPlayingAudio(true);
    const transcript = call.transcript.filter(t => t.sender === 'agent' || t.sender === 'user');
    if (transcript.length === 0) return;

    let index = currentPlaybackIndex < transcript.length ? currentPlaybackIndex : 0;

    const playNextTurn = () => {
      if (index >= transcript.length) {
        setIsPlayingAudio(false);
        setCurrentPlaybackIndex(0);
        return;
      }

      setCurrentPlaybackIndex(index);
      const turn = transcript[index];
      const isAgent = turn.sender === 'agent';

      speechEngine.speak(turn.text, {
        voiceGender: isAgent ? 'female' : 'male',
        rate: playbackSpeed,
        onEnd: () => {
          index++;
          setTimeout(playNextTurn, 400);
        },
        onError: () => {
          setIsPlayingAudio(false);
        }
      });
    };

    playNextTurn();
  };

  // Copy transcript to clipboard
  const handleCopyTranscript = (call: CallLog) => {
    const text = call.transcript
      .map(t => `[${t.timestamp}] ${t.sender.toUpperCase()}: ${t.text}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download Transcript TXT
  const handleDownloadTranscript = (call: CallLog) => {
    const text = `ROBOVOICECALL LOG REPORT\nCall ID: ${call.id}\nTimestamp: ${call.timestamp}\nDuration: ${call.durationSeconds}s\nAgent: ${call.agentName}\nCaller: ${call.callerName} (${call.callerNumber})\nDisposition: ${call.disposition}\nSummary: ${call.summary}\n\nTRANSCRIPT:\n` +
      call.transcript.map(t => `[${t.timestamp}] ${t.sender.toUpperCase()}: ${t.text}`).join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call_${call.id}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search transcripts, caller names, or phone numbers..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Agent Filter */}
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:border-cyan-500"
          >
            <option value="all">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Disposition Filter */}
          <select
            value={filterDisposition}
            onChange={(e) => setFilterDisposition(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:border-cyan-500"
          >
            <option value="all">All Outcomes</option>
            <option value="completed">Completed</option>
            <option value="voicemail">Voicemail (AMD)</option>
            <option value="transferred">Transferred</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium">Caller & Number</th>
                <th className="py-3 px-4 font-medium">Voice Agent</th>
                <th className="py-3 px-4 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Duration</th>
                <th className="py-3 px-4 font-medium">Disposition</th>
                <th className="py-3 px-4 font-medium">Sentiment</th>
                <th className="py-3 px-4 font-medium text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center font-sans">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">No Call Logs Recorded Yet</h4>
                        <p className="text-xs text-slate-400 mt-1">
                          Completed calls will appear here with full audio recordings and speaker transcripts.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {onNavigateCall && (
                          <button
                            onClick={onNavigateCall}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition"
                          >
                            Start Live Call
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    onClick={() => onSelectCall(call)}
                    className="hover:bg-slate-800/50 cursor-pointer transition"
                  >
                    <td className="py-3 px-4">
                      {call.direction === 'outbound' ? (
                        <span className="flex items-center gap-1 text-[11px] text-cyan-400 font-sans">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Outbound</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-sans">
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>Inbound</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <div className="font-semibold text-slate-200">{call.callerName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{call.callerNumber}</div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300">
                      {call.agentName}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px] tabular-nums">
                      {call.timestamp}
                    </td>
                    <td className="py-3 px-4 text-slate-300 tabular-nums">
                      {call.durationSeconds}s
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        call.disposition === 'Completed' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        call.disposition === 'Voicemail' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' :
                        call.disposition === 'Transferred' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {call.disposition}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans capitalize">
                      <span className={`text-xs ${
                        call.sentiment === 'positive' ? 'text-emerald-400' :
                        call.sentiment === 'urgent' ? 'text-rose-400' : 'text-slate-400'
                      }`}>
                        {call.sentiment}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCall(call);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Call Deep-Dive Modal / Drawer */}
      {activeInspectCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Call Inspection: {activeInspectCall.callerName}</span>
                    <span className="font-mono text-xs text-slate-400 font-normal">({activeInspectCall.id})</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeInspectCall.direction.toUpperCase()} · Handled by {activeInspectCall.agentName} · {activeInspectCall.timestamp}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyTranscript(activeInspectCall)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                  title="Copy Transcript"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => handleDownloadTranscript(activeInspectCall)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                  title="Download TXT"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => onSelectCall(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex flex-col gap-5">
              {/* Playback Audio Synthesizer Bar */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => handleTogglePlayback(activeInspectCall)}
                    className="w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-md transition shrink-0"
                  >
                    {isPlayingAudio ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Call Transcript Reader</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {isPlayingAudio ? `Reading turn #${currentPlaybackIndex + 1}...` : 'Read recorded call transcript aloud'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Speed:</span>
                  {[1.0, 1.25, 1.5].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                        playbackSpeed === spd 
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold' 
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Call Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Duration</span>
                  <span className="text-sm font-mono font-bold text-white tabular-nums">
                    {activeInspectCall.durationSeconds}s
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Roundtrip Latency</span>
                  <span className="text-sm font-mono font-bold text-cyan-400 tabular-nums">
                    {activeInspectCall.latencyMs}ms
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">VoIP Call Cost</span>
                  <span className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
                    {activeInspectCall.cost === 0 ? 'FREE ($0.00)' : `$${activeInspectCall.cost.toFixed(2)}`}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Disposition</span>
                  <span className="text-sm font-mono font-bold text-white">
                    {activeInspectCall.disposition}
                  </span>
                </div>
              </div>

              {/* AI Executive Summary */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Call Summary & Metadata</span>
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeInspectCall.summary}
                </p>

                {/* Key Entities */}
                {Object.keys(activeInspectCall.keyEntities || {}).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80 mt-1">
                    {Object.entries(activeInspectCall.keyEntities).map(([k, v], i) => (
                      <div key={i} className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                        <span className="text-slate-500">{k}:</span> <span className="text-cyan-300 font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Complete Transcript */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  Full Speaker Transcript ({activeInspectCall.transcript.length} Messages)
                </span>
                <div className="flex flex-col gap-2 rounded-lg bg-slate-950 p-3.5 border border-slate-800 max-h-72 overflow-y-auto">
                  {activeInspectCall.transcript.map((item, idx) => {
                    if (item.sender === 'system') {
                      return (
                        <div key={idx} className="text-center my-1">
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            {item.text}
                          </span>
                        </div>
                      );
                    }
                    const isAgent = item.sender === 'agent';
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-2 mb-0.5 text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-400">
                            {isAgent ? activeInspectCall.agentName : activeInspectCall.callerName}
                          </span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">{item.timestamp}</span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed ${
                            isAgent
                              ? 'bg-slate-800 text-slate-200 border border-slate-700/60'
                              : 'bg-cyan-900/60 text-cyan-100 border border-cyan-700/60'
                          }`}
                        >
                          {item.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
