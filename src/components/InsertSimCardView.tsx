import React, { useState } from 'react';
import { Smartphone, ChevronLeft, Signal, Wifi, Check, Plus, RefreshCw, Radio } from 'lucide-react';

interface InsertSimCardViewProps {
  onBack: () => void;
  onNavigateTelephony?: () => void;
}

export const InsertSimCardView: React.FC<InsertSimCardViewProps> = ({ onBack, onNavigateTelephony }) => {
  const [simSlots, setSimSlots] = useState([
    {
      slot: 1,
      name: 'Primary Cellular Line (SIM 1)',
      carrier: 'Local Telecom Carrier (Active SIM)',
      number: 'SIM Card Airtime Line',
      iccid: '89014103211118552391',
      status: 'active',
      signal: 4,
      network: '5G / 4G LTE VoLTE'
    },
    {
      slot: 2,
      name: 'Secondary Slot (SIM 2 / eSIM)',
      carrier: 'Optional Secondary Carrier',
      number: 'Unassigned / Ready',
      iccid: '89014103211118559042',
      status: 'active',
      signal: 3,
      network: '4G LTE'
    }
  ]);

  const [isActivating, setIsActivating] = useState(false);

  const handleActivateNewSim = () => {
    setIsActivating(true);
    setTimeout(() => {
      setSimSlots(prev => [
        ...prev,
        {
          slot: prev.length + 1,
          name: `Cellular Gateway Trunk (SIM ${prev.length + 1})`,
          carrier: 'T-Mobile US Direct Trunk',
          number: '+1 (312) 555-0811',
          iccid: '8901410321111855' + Math.floor(Math.random() * 9000),
          status: 'active',
          signal: 4,
          network: '5G Standalone'
        }
      ]);
      setIsActivating(false);
    }, 1200);
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
          <Smartphone className="w-5 h-5 text-sky-600" />
          <span>SIM Card & Cellular Gateway Interface</span>
        </h2>

        <div className="w-12" />
      </div>

      {/* SIM Card Airtime Primary Priority Mode */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/50 rounded-xl p-4 shadow-md text-white">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 mt-0.5 shadow-sm font-bold">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-emerald-300">
                1st Priority: Physical SIM Card Cellular Airtime
              </h4>
              <span className="px-2 py-0.5 rounded bg-emerald-400 text-slate-950 text-[10px] font-extrabold uppercase">
                Airtime Active
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mt-1">
              Your device's physical SIM card and cellular network carrier airtime minutes are prioritized for placing direct live calls. When you place a call, calls route completely inside RoboVoiceCall through your in-app Cellular SIM & WebRTC Trunk without opening external dialers — 100% in-app live calling with all permissions allowed.
            </p>
          </div>
        </div>
      </div>

      {onNavigateTelephony && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-sky-900 font-medium">
            <Radio className="w-4 h-4 text-sky-600" />
            <span>Need cloud-hosted Inbound Toll-Free or Local DID numbers?</span>
          </div>
          <button
            onClick={onNavigateTelephony}
            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition active:scale-95 whitespace-nowrap cursor-pointer shadow-sm"
          >
            Manage Phone Numbers →
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Cellular Hardware Trunks</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect physical SIM cards or virtual eSIMs for direct cellular PSTN voice termination.
            </p>
          </div>
          <button
            onClick={handleActivateNewSim}
            disabled={isActivating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            {isActivating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{isActivating ? 'Provisioning...' : 'Provision SIM'}</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {simSlots.map((sim) => (
            <div
              key={sim.slot}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{sim.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold uppercase">
                      {sim.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-1">
                    {sim.number} · <span className="font-sans text-slate-500">{sim.carrier}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    ICCID: {sim.iccid} · Band: {sim.network}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-emerald-600">
                  <Signal className="w-4 h-4" />
                  <span className="text-xs font-semibold">{sim.network}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
