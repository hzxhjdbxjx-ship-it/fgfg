import React, { useState, useEffect } from 'react';
import { Campaign, VoiceAgent, CampaignContact } from '../types';
import { 
  Radio, Play, Pause, Plus, Users, PhoneCall, CheckCircle, 
  AlertCircle, Upload, X, ShieldAlert, Sparkles, RefreshCw, ChevronRight,
  ChevronLeft, Calendar
} from 'lucide-react';

interface CampaignsProps {
  campaigns: Campaign[];
  agents: VoiceAgent[];
  onUpdateCampaigns: (c: Campaign[]) => void;
  onLaunchLiveDialer: (contact: CampaignContact, agentId: string) => void;
  onBack?: () => void;
  onOpenScheduler?: () => void;
}

export const Campaigns: React.FC<CampaignsProps> = ({
  campaigns,
  agents,
  onUpdateCampaigns,
  onLaunchLiveDialer,
  onBack,
  onOpenScheduler
}) => {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign>(campaigns[0]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSimulatingBatch, setIsSimulatingBatch] = useState(false);

  // New Campaign Form
  const [newCampName, setNewCampName] = useState('');
  const [newCampAgentId, setNewCampAgentId] = useState(agents[1]?.id || agents[0]?.id);
  const [newCampConcurrency, setNewCampConcurrency] = useState(8);
  const [newCampScript, setNewCampScript] = useState('Hi {{first_name}}, this is {{agent_name}} calling regarding your inquiry at {{company}}...');

  // Multi-line live simulator state
  const [activeChannels, setActiveChannels] = useState<{
    lineNum: number;
    contactName: string;
    number: string;
    status: 'idle' | 'dialing' | 'ringing' | 'connected' | 'completed' | 'voicemail';
    duration: number;
  }[]>([]);

  // Sync selected campaign with parent list updates
  useEffect(() => {
    if (selectedCampaign) {
      const updated = campaigns.find(c => c.id === selectedCampaign.id);
      if (updated) setSelectedCampaign(updated);
    } else if (campaigns.length > 0) {
      setSelectedCampaign(campaigns[0]);
    }
  }, [campaigns]);

  // Simulation runner effect
  useEffect(() => {
    let interval: number | null = null;
    if (isSimulatingBatch && selectedCampaign) {
      // Initialize channels
      if (activeChannels.length === 0) {
        const contactPool = selectedCampaign.contacts || [];
        const initialChannels = Array.from({ length: selectedCampaign.concurrencyLimit }).map((_, i) => {
          const contact = contactPool.length > 0 ? contactPool[i % contactPool.length] : undefined;
          return {
            lineNum: i + 1,
            contactName: contact ? contact.name : `Contact #${i + 1}`,
            number: contact ? contact.phoneNumber : `+1 (555) 010-${1000 + i}`,
            status: 'dialing' as const,
            duration: 0
          };
        });
        setActiveChannels(initialChannels);
      }

      interval = window.setInterval(() => {
        setActiveChannels(prev => prev.map(ch => {
          if (ch.status === 'dialing') {
            return { ...ch, status: 'ringing', duration: 1 };
          }
          if (ch.status === 'ringing') {
            const rand = Math.random();
            return {
              ...ch,
              status: rand > 0.25 ? 'connected' : 'voicemail',
              duration: 2
            };
          }
          if (ch.status === 'connected') {
            if (ch.duration > 6) {
              return { ...ch, status: 'completed' };
            }
            return { ...ch, duration: ch.duration + 1 };
          }
          if (ch.status === 'completed' || ch.status === 'voicemail') {
            const pool = selectedCampaign.contacts || [];
            const nextContact = pool.length > 0
              ? pool[(ch.lineNum + Math.floor(Math.random() * pool.length)) % pool.length]
              : undefined;
            const nextIdx = Math.floor(Math.random() * 2000);
            return {
              ...ch,
              contactName: nextContact ? nextContact.name : `Prospect #${nextIdx}`,
              number: nextContact ? nextContact.phoneNumber : `+1 (415) 555-${1000 + (nextIdx % 900)}`,
              status: 'dialing',
              duration: 0
            };
          }
          return ch;
        }));

        // Increment campaign stats and persist to parent state
        setSelectedCampaign(curr => {
          if (!curr) return curr;
          const newCalled = Math.min(curr.totalContacts, curr.calledCount + 1);
          const newConnected = Math.min(newCalled, curr.connectedCount + (Math.random() > 0.2 ? 1 : 0));
          const isDone = newCalled >= curr.totalContacts;
          const updatedContacts = curr.contacts.map((ct, idx) =>
            idx < newCalled && ct.status === 'pending'
              ? { ...ct, status: 'completed' as const }
              : ct
          );
          const nextCamp: Campaign = {
            ...curr,
            calledCount: newCalled,
            connectedCount: newConnected,
            status: isDone ? 'completed' : 'running',
            contacts: updatedContacts
          };
          onUpdateCampaigns(campaigns.map(c => (c.id === nextCamp.id ? nextCamp : c)));
          if (isDone) setIsSimulatingBatch(false);
          return nextCamp;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSimulatingBatch, selectedCampaign?.id]);

  // Handle create campaign
  const handleCreateCampaign = () => {
    if (!newCampName.trim()) return;
    const agent = agents.find(a => a.id === newCampAgentId) || agents[0];
    const newCamp: Campaign = {
      id: `camp-${Date.now().toString().slice(-4)}`,
      name: newCampName,
      agentId: agent.id,
      agentName: agent.name,
      status: 'draft',
      totalContacts: 100,
      calledCount: 0,
      connectedCount: 0,
      concurrencyLimit: newCampConcurrency,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      scriptSnippet: newCampScript,
      contacts: [
        { id: 'nc-1', name: 'Alexander Hamilton', phoneNumber: '+1 (212) 555-1776', variables: { first_name: 'Alexander', company: 'Treasury Partners' }, status: 'pending' },
        { id: 'nc-2', name: 'Eleanor Roosevelt', phoneNumber: '+1 (202) 555-1933', variables: { first_name: 'Eleanor', company: 'Global Affairs Inc' }, status: 'pending' },
        { id: 'nc-3', name: 'Benjamin Franklin', phoneNumber: '+1 (215) 555-1752', variables: { first_name: 'Benjamin', company: 'Electric Ventures' }, status: 'pending' },
      ]
    };

    onUpdateCampaigns([newCamp, ...campaigns]);
    setSelectedCampaign(newCamp);
    setShowCreateModal(false);
    setNewCampName('');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Back to Home"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>Outbound Robo-Dialer Campaigns</span>
            </h2>
            <p className="text-xs text-slate-400">
              Dispatch autonomous multi-line voice campaigns with smart AMD (Answering Machine Detection)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenScheduler && (
            <button
              onClick={onOpenScheduler}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition"
              title="Open 5-Step Campaign Scheduler"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>5-Step Scheduler</span>
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-md transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Campaign List (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <span className="text-xs uppercase font-mono text-slate-400 font-semibold">
            All Campaigns ({campaigns.length})
          </span>
          <div className="flex flex-col gap-2">
            {campaigns.map((camp) => {
              const isSelected = selectedCampaign?.id === camp.id;
              const progressPct = Math.round((camp.calledCount / camp.totalContacts) * 100);

              return (
                <div
                  key={camp.id}
                  onClick={() => setSelectedCampaign(camp)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500/80 shadow-md ring-1 ring-cyan-500/40'
                      : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-xs font-bold text-white leading-snug line-clamp-1">
                      {camp.name}
                    </h4>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded capitalize ${
                      camp.status === 'running' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                      camp.status === 'completed' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                      camp.status === 'paused' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {camp.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Agent: {camp.agentName}</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-400 tabular-nums">
                        {camp.calledCount} / {camp.totalContacts} Called
                      </span>
                      <span className="text-cyan-400 font-semibold tabular-nums">{progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Campaign Command Center (8 cols) */}
        {selectedCampaign && (
          <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-5">
            {/* Header with Run / Pause Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{selectedCampaign.name}</h3>
                <p className="text-xs text-slate-400">
                  Assigned Agent: <span className="text-cyan-300 font-medium">{selectedCampaign.agentName}</span> · Max Concurrency: <span className="font-mono text-slate-300">{selectedCampaign.concurrencyLimit} Lines</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSimulatingBatch(!isSimulatingBatch)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs shadow-md transition ${
                    isSimulatingBatch
                      ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isSimulatingBatch ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause Multi-Line Dialer</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Execute Batch Runner</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Campaign Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Total Audience</span>
                <span className="text-base font-mono font-bold text-white tabular-nums">
                  {selectedCampaign.totalContacts}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Dials Completed</span>
                <span className="text-base font-mono font-bold text-cyan-400 tabular-nums">
                  {selectedCampaign.calledCount}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Live Pickups</span>
                <span className="text-base font-mono font-bold text-emerald-400 tabular-nums">
                  {selectedCampaign.connectedCount}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-slate-500 block">Connection Rate</span>
                <span className="text-base font-mono font-bold text-white tabular-nums">
                  {selectedCampaign.calledCount > 0 
                    ? Math.round((selectedCampaign.connectedCount / selectedCampaign.calledCount) * 100) 
                    : 0}%
                </span>
              </div>
            </div>

            {/* Real-time Multi-Line Concurrency Channel Monitor */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isSimulatingBatch ? 'bg-cyan-500 animate-ping' : 'bg-slate-600'}`} />
                  <span>Real-Time Edge Concurrency Lines ({selectedCampaign.concurrencyLimit} Channels)</span>
                </span>
                <span className="text-slate-500 font-mono text-[11px]">SIP Edge Trunk US-East</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                {(activeChannels.length > 0 ? activeChannels : Array.from({ length: 4 }).map((_, i) => ({
                  lineNum: i + 1,
                  contactName: `Standby Trunk #${i + 1}`,
                  number: '+1 (555) --- ----',
                  status: 'idle' as const,
                  duration: 0
                }))).map((ch, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                        L{ch.lineNum}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-200 line-clamp-1">{ch.contactName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{ch.number}</div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className={`text-[10px] font-mono capitalize font-medium ${
                        ch.status === 'connected' ? 'text-emerald-400 animate-pulse' :
                        ch.status === 'ringing' || ch.status === 'dialing' ? 'text-amber-400' :
                        ch.status === 'voicemail' ? 'text-indigo-400' : 'text-slate-500'
                      }`}>
                        {ch.status}
                      </span>
                      {ch.duration > 0 && (
                        <span className="font-mono text-[9px] text-slate-500 tabular-nums">
                          {ch.duration}s
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Roster Table */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300">
                Audience Contact Queue ({selectedCampaign.contacts.length} Previewed)
              </span>

              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Contact</th>
                      <th className="py-2.5 px-3 font-medium">Phone</th>
                      <th className="py-2.5 px-3 font-medium">Custom Variable</th>
                      <th className="py-2.5 px-3 font-medium">Status</th>
                      <th className="py-2.5 px-3 font-medium text-right">Single Dial</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {selectedCampaign.contacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                          {contact.name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{contact.phoneNumber}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-sans">
                          {Object.entries(contact.variables || {})[0] 
                            ? `${Object.entries(contact.variables)[0][0]}: ${Object.entries(contact.variables)[0][1]}`
                            : 'Standard'}
                        </td>
                        <td className="py-2.5 px-3 font-sans capitalize">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            contact.status === 'completed' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                            contact.status === 'connected' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                            contact.status === 'calling' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            contact.status === 'voicemail' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {contact.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => onLaunchLiveDialer(contact, selectedCampaign.agentId)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-sans transition"
                          >
                            Dial Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Create Outbound Campaign</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Campaign Title
                </label>
                <input
                  type="text"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="e.g., Q1 Product Recall Notification"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Assigned AI Voice Agent
                </label>
                <select
                  value={newCampAgentId}
                  onChange={(e) => setNewCampAgentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Concurrent Calling Lines</span>
                  <span className="font-mono text-cyan-400 font-bold">{newCampConcurrency} Lines</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={newCampConcurrency}
                  onChange={(e) => setNewCampConcurrency(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Script Template with Dynamic Variables
                </label>
                <textarea
                  value={newCampScript}
                  onChange={(e) => setNewCampScript(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                />
                <span className="text-[10px] text-slate-500">
                  Interpolates variables like: {"{{first_name}}"}, {"{{company}}"}, {"{{appointment_date}}"}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={!newCampName.trim()}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition disabled:opacity-50"
              >
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
