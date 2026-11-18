import React, { useState } from 'react';
import { VoiceAgent } from '../types';
import { speechEngine } from '../utils/speech';
import { unlockAudioAndSpeech, playConnectChime } from '../utils/audio';
import { 
  Bot, Volume2, Sparkles, Sliders, Shield, BookOpen, Plus, 
  Trash2, Check, RefreshCw, Play
} from 'lucide-react';

interface AgentStudioProps {
  agents: VoiceAgent[];
  onUpdateAgents: (agents: VoiceAgent[]) => void;
  onSelectAgentForCall: (agentId: string) => void;
}

export const AgentStudio: React.FC<AgentStudioProps> = ({
  agents,
  onUpdateAgents,
  onSelectAgentForCall
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || '');
  const currentAgent = agents.find(a => a.id === selectedAgentId) || agents[0];

  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [newKbItem, setNewKbItem] = useState('');
  const [saveToast, setSaveToast] = useState(false);

  // Update field of current agent
  const handleUpdateField = (field: keyof VoiceAgent, value: any) => {
    const updated = agents.map(a => {
      if (a.id === currentAgent.id) {
        return { ...a, [field]: value };
      }
      return a;
    });
    onUpdateAgents(updated);
  };

  // Add knowledge base rule
  const handleAddKb = () => {
    if (!newKbItem.trim()) return;
    const updatedKb = [...currentAgent.knowledgeBase, newKbItem.trim()];
    handleUpdateField('knowledgeBase', updatedKb);
    setNewKbItem('');
  };

  // Delete knowledge base rule
  const handleDeleteKb = (index: number) => {
    const updatedKb = currentAgent.knowledgeBase.filter((_, i) => i !== index);
    handleUpdateField('knowledgeBase', updatedKb);
  };

  // Test speaking voice
  const handleTestVoice = () => {
    unlockAudioAndSpeech();
    playConnectChime();
    setIsTestingVoice(true);
    speechEngine.speak(currentAgent.firstMessage, {
      voiceName: currentAgent.voiceName,
      voiceGender: currentAgent.voiceGender,
      pitch: currentAgent.pitch,
      rate: currentAgent.rate,
      onEnd: () => setIsTestingVoice(false),
      onError: () => setIsTestingVoice(false)
    });
  };

  // Create new custom agent
  const handleCreateNewAgent = () => {
    const newAgent: VoiceAgent = {
      id: `agent-custom-${Date.now().toString().slice(-4)}`,
      name: 'Nova Custom AI',
      role: 'Autonomous Inbound/Outbound Assistant',
      avatarUrl: '/src/assets/images/avatar_voice_ava_1790137650253.jpg',
      voiceName: 'Jenny / Samantha Natural',
      voiceGender: 'female',
      voiceAccent: 'US Standard Neutral',
      pitch: 1.0,
      rate: 1.0,
      systemPrompt: 'You are an autonomous AI voice representative. Answer questions concisely and courteously.',
      firstMessage: "Hello! This is Nova with automated services. How can I help you today?",
      knowledgeBase: [
        "Company operating hours are Monday through Friday 9 AM to 6 PM EST.",
        "Pricing plans start at $49/mo with zero contract requirements."
      ],
      interruptionSensitivity: 80,
      silenceTimeoutMs: 1400,
      toolsEnabled: ['check_status', 'transfer_to_human'],
      category: 'custom'
    };

    const updated = [...agents, newAgent];
    onUpdateAgents(updated);
    setSelectedAgentId(newAgent.id);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span>Voice Agent Studio & Persona Configurator</span>
          </h2>
          <p className="text-xs text-slate-400">
            Fine-tune voice synthesis timbre, conversational latency, prompt instructions, and tool capabilities
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNewAgent}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-md transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Voice Agent</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agent Selector List (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <span className="text-xs uppercase font-mono text-slate-400 font-semibold">
            Agents Roster ({agents.length})
          </span>

          <div className="flex flex-col gap-2">
            {agents.map((agent) => {
              const isSelected = agent.id === currentAgent.id;
              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500/80 shadow-md ring-1 ring-cyan-500/40'
                      : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <img
                    src={agent.avatarUrl}
                    alt={agent.name}
                    className="w-11 h-11 rounded-full object-cover border border-slate-700 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white truncate">{agent.name}</h4>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                        {agent.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{agent.role}</p>
                    <p className="text-[10px] text-cyan-400 font-mono mt-1">
                      {agent.voiceGender === 'female' ? 'Female' : 'Male'} · {agent.voiceAccent}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Agent Editor (8 cols) */}
        {currentAgent && (
          <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-5">
            {/* Header with Test Voice Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <img
                  src={currentAgent.avatarUrl}
                  alt={currentAgent.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <h3 className="text-base font-bold text-white">{currentAgent.name}</h3>
                  <p className="text-xs text-slate-400">{currentAgent.role}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestVoice}
                  disabled={isTestingVoice}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs font-medium transition"
                >
                  <Volume2 className={`w-3.5 h-3.5 ${isTestingVoice ? 'animate-bounce' : ''}`} />
                  <span>{isTestingVoice ? 'Testing Voice...' : 'Play Sample Voice'}</span>
                </button>
                <button
                  onClick={() => onSelectAgentForCall(currentAgent.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch in Simulator</span>
                </button>
              </div>
            </div>

            {/* Voice & Synthesis Parameters */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-4">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Voice Model & Speech Acoustics</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Voice Gender</label>
                  <select
                    value={currentAgent.voiceGender}
                    onChange={(e) => handleUpdateField('voiceGender', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Accent Profile</label>
                  <input
                    type="text"
                    value={currentAgent.voiceAccent}
                    onChange={(e) => handleUpdateField('voiceAccent', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Assigned Voice</label>
                  <input
                    type="text"
                    value={currentAgent.voiceName}
                    onChange={(e) => handleUpdateField('voiceName', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              {/* Pitch & Rate Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-900">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Voice Pitch</span>
                    <span className="font-mono text-cyan-400 font-bold tabular-nums">
                      {currentAgent.pitch.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.35"
                    step="0.02"
                    value={currentAgent.pitch}
                    onChange={(e) => handleUpdateField('pitch', Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Speaking Rate</span>
                    <span className="font-mono text-cyan-400 font-bold tabular-nums">
                      {currentAgent.rate.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.80"
                    max="1.30"
                    step="0.02"
                    value={currentAgent.rate}
                    onChange={(e) => handleUpdateField('rate', Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Conversation Prompts & First Message */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Initial Greeting Utterance
                </label>
                <input
                  type="text"
                  value={currentAgent.firstMessage}
                  onChange={(e) => handleUpdateField('firstMessage', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  System Prompt & Persona Directive
                </label>
                <textarea
                  value={currentAgent.systemPrompt}
                  onChange={(e) => handleUpdateField('systemPrompt', e.target.value)}
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-cyan-500 font-sans leading-relaxed"
                />
              </div>
            </div>

            {/* Knowledge Base FAQs */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span>Domain Knowledge & Policy Vault ({currentAgent.knowledgeBase.length} Rules)</span>
              </span>

              <div className="flex flex-col gap-1.5 bg-slate-950 p-3 rounded-lg border border-slate-800">
                {currentAgent.knowledgeBase.map((kb, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800/80 text-xs text-slate-300"
                  >
                    <span>{kb}</span>
                    <button
                      onClick={() => handleDeleteKb(idx)}
                      className="text-slate-500 hover:text-rose-400 transition shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add KB Rule Input */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    value={newKbItem}
                    onChange={(e) => setNewKbItem(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddKb(); }}
                    placeholder="Add a new business policy, FAQ, or constraint..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleAddKb}
                    disabled={!newKbItem.trim()}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition disabled:opacity-40"
                  >
                    Add Rule
                  </button>
                </div>
              </div>
            </div>

            {/* Function Tools Configuration */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                <span>Telephony Actions & Guardrail Function Tools</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'transfer_to_human', label: 'Human Transfer Escalation' },
                  { id: 'check_calendar_slot', label: 'Google/Outlook Calendar' },
                  { id: 'book_demo_meeting', label: 'CRM Meeting Booking' },
                  { id: 'send_sms_link', label: 'Instant SMS Dispatch' },
                  { id: 'reset_auth_token', label: 'Magic Link Token Dispatch' },
                  { id: 'lock_debit_card', label: 'Emergency Card Freeze' },
                ].map((tool) => {
                  const isEnabled = currentAgent.toolsEnabled.includes(tool.id);
                  return (
                    <button
                      key={tool.id}
                      onClick={() => {
                        const nextTools = isEnabled
                          ? currentAgent.toolsEnabled.filter(t => t !== tool.id)
                          : [...currentAgent.toolsEnabled, tool.id];
                        handleUpdateField('toolsEnabled', nextTools);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition font-mono ${
                        isEnabled
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-700/80 shadow-sm'
                          : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isEnabled ? '✓ ' : '+ '} {tool.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
