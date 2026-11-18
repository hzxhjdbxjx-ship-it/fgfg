import React, { useState } from 'react';
import { PhoneNumberItem, VoiceAgent } from '../types';
import { 
  Users, Plus, PhoneCall, Globe, Check, AlertCircle, 
  Send, Sparkles, X, ShieldCheck, ArrowRight, ChevronLeft
} from 'lucide-react';

interface PhoneNumbersProps {
  phoneNumbers: PhoneNumberItem[];
  agents: VoiceAgent[];
  onUpdatePhoneNumbers: (nums: PhoneNumberItem[]) => void;
  onSelectNumberForCall: (num: string, agentId: string) => void;
  onBack?: () => void;
}

export const PhoneNumbers: React.FC<PhoneNumbersProps> = ({
  phoneNumbers,
  agents,
  onUpdatePhoneNumbers,
  onSelectNumberForCall,
  onBack
}) => {
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [selectedAreaCode, setSelectedAreaCode] = useState('415');
  const [selectedCountry, setSelectedCountry] = useState('United States');
  const [selectedType, setSelectedType] = useState<'local' | 'toll-free'>('local');

  // Webhook Tester
  const [webhookUrl, setWebhookUrl] = useState('https://api.yourdomain.com/webhooks/robovoice');
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);

  // Buy new number simulation
  const handleProvisionNumber = () => {
    const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
    const newNum: PhoneNumberItem = {
      id: `phone-${Date.now()}`,
      number: selectedType === 'toll-free' 
        ? `+1 (888) ${Math.floor(Math.random() * 900) + 100}-${randomSuffix}`
        : `+1 (${selectedAreaCode}) ${Math.floor(Math.random() * 900) + 100}-${randomSuffix}`,
      country: selectedCountry,
      type: selectedType,
      assignedAgentId: agents[0]?.id || 'agent-ava',
      monthlyCost: selectedType === 'toll-free' ? 4.50 : 2.00,
      status: 'active',
      recordCalls: true
    };

    onUpdatePhoneNumbers([...phoneNumbers, newNum]);
    setShowBuyModal(false);
  };

  // Toggle call recording
  const handleToggleRecording = (id: string) => {
    const updated = phoneNumbers.map(p => {
      if (p.id === id) {
        return { ...p, recordCalls: !p.recordCalls };
      }
      return p;
    });
    onUpdatePhoneNumbers(updated);
  };

  // Assign agent
  const handleAssignAgent = (phoneId: string, agentId: string) => {
    const updated = phoneNumbers.map(p => {
      if (p.id === phoneId) {
        return { ...p, assignedAgentId: agentId };
      }
      return p;
    });
    onUpdatePhoneNumbers(updated);
  };

  // Send simulated test webhook
  const handleTestWebhook = () => {
    setWebhookStatus('Dispatching JSON payload to ' + webhookUrl + '...');
    setTimeout(() => {
      setWebhookStatus('HTTP 200 OK: Event `call.completed` acknowledged with SHA-256 signature.');
    }, 800);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
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
              <Users className="w-4 h-4 text-cyan-400" />
              <span>Virtual Phone Numbers & Inbound SIP Routing</span>
            </h2>
            <p className="text-xs text-slate-400">
              Provision local & toll-free DID numbers and route calls straight to autonomous AI Voice Agents
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBuyModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-md transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Provision Phone Number</span>
          </button>
        </div>
      </div>

      {/* Numbers Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-medium">Virtual DID Number</th>
                <th className="py-3 px-4 font-medium">Country / Region</th>
                <th className="py-3 px-4 font-medium">Assigned AI Agent</th>
                <th className="py-3 px-4 font-medium">Monthly Cost</th>
                <th className="py-3 px-4 font-medium">Two-Party Consent Recording</th>
                <th className="py-3 px-4 font-medium text-right">Direct Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {phoneNumbers.map((p) => {
                const assignedAgent = agents.find(a => a.id === p.assignedAgentId);
                return (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-100 flex items-center gap-2">
                        <PhoneCall className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{p.number}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase font-sans">
                        {p.type} DID
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300">
                      {p.country}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <select
                        value={p.assignedAgentId}
                        onChange={(e) => handleAssignAgent(p.id, e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-cyan-300 outline-none focus:border-cyan-500 font-sans"
                      >
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.category})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-slate-300 tabular-nums">
                      ${p.monthlyCost.toFixed(2)}/mo
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <button
                        onClick={() => handleToggleRecording(p.id)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                          p.recordCalls 
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {p.recordCalls ? 'Enabled (Disclaimer on)' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        onClick={() => onSelectNumberForCall(p.number, p.assignedAgentId)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs transition"
                      >
                        Call In
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Webhook & Telephony Integration Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">Call-End Webhooks & Telephony Events</h3>
            <p className="text-xs text-slate-400">
              Receive real-time transcripts, sentiment scores, and extracted entities immediately upon call hangup
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
            HMAC SHA-256 Verified
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
            placeholder="https://api.yourdomain.com/webhooks"
          />
          <button
            onClick={handleTestWebhook}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 font-semibold text-xs whitespace-nowrap transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Event</span>
          </button>
        </div>

        {webhookStatus && (
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300">
            {webhookStatus}
          </div>
        )}

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-400 flex flex-col gap-2">
          <span className="font-mono text-slate-300 font-semibold text-[11px]">SAMPLE WEBHOOK PAYLOAD PREVIEW:</span>
          <pre className="font-mono text-[11px] text-slate-400 overflow-x-auto p-2 bg-slate-900 rounded">
{`{
  "event": "call.completed",
  "call_id": "call-901",
  "agent_id": "agent-marcus",
  "caller": "+1 (415) 890-2144",
  "duration_seconds": 142,
  "disposition": "Completed",
  "sentiment": "positive",
  "extracted_entities": {
    "meeting_booked": "Thursday, 2:00 PM EST",
    "email": "s.jenkins@fintechvel.com"
  },
  "recording_url": "https://storage.robovoicecall.telecom/recordings/call-901.wav"
}`}
          </pre>
        </div>
      </div>

      {/* Provision Phone Modal */}
      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Provision Virtual Number</h3>
              <button
                onClick={() => setShowBuyModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Country</label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                >
                  <option value="United States">United States (+1)</option>
                  <option value="United Kingdom">United Kingdom (+44)</option>
                  <option value="Canada">Canada (+1)</option>
                  <option value="Australia">Australia (+61)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Number Category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSelectedType('local')}
                    className={`py-2 rounded-lg border text-xs font-medium transition ${
                      selectedType === 'local'
                        ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Local ($2.00/mo)
                  </button>
                  <button
                    onClick={() => setSelectedType('toll-free')}
                    className={`py-2 rounded-lg border text-xs font-medium transition ${
                      selectedType === 'toll-free'
                        ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Toll-Free ($4.50/mo)
                  </button>
                </div>
              </div>

              {selectedType === 'local' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">US Area Code</label>
                  <input
                    type="text"
                    value={selectedAreaCode}
                    onChange={(e) => setSelectedAreaCode(e.target.value)}
                    placeholder="e.g., 415, 212, 312"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowBuyModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleProvisionNumber}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition"
              >
                Confirm & Allocate DID
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
