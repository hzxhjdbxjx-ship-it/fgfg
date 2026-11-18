import React, { useState } from 'react';
import { TrialBalance, CallLog } from '../types';
import { 
  Gauge, Phone, Clock, ShieldCheck, Zap, ArrowRight, 
  CheckCircle2, Sparkles, ChevronLeft, BarChart2, Smartphone, Award, Check,
  Activity, TrendingUp
} from 'lucide-react';
import { Dashboard } from './Dashboard';

interface TrialDashboardViewProps {
  trialBalance: TrialBalance;
  calls?: CallLog[];
  onNavigateCall: () => void;
  onNavigateUpgrade: () => void;
  onViewCallDetail?: (call: CallLog) => void;
  onBack: () => void;
}

export const TrialDashboardView: React.FC<TrialDashboardViewProps> = ({
  trialBalance,
  calls = [],
  onNavigateCall,
  onNavigateUpgrade,
  onViewCallDetail,
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<'license' | 'analytics'>('license');

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
          <Gauge className="w-5 h-5 text-sky-600" />
          <span>App Telephony Dashboard</span>
        </h2>

        <div className="w-12" />
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 bg-slate-200/80 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('license')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'license'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Lifetime Ownership & Quota</span>
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'analytics'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-4 h-4 text-sky-600" />
          <span>Live ROI & Telephony Analytics</span>
        </button>
      </div>

      {activeTab === 'analytics' ? (
        <div className="pt-1">
          <Dashboard
            calls={calls}
            onViewCallDetail={onViewCallDetail || (() => {})}
            onNavigateTab={() => onNavigateCall()}
          />
        </div>
      ) : (
        <>
          {/* Top Card: 100% LIFETIME OWNED APP */}
      <div className="w-full bg-gradient-to-br from-[#061A40] via-[#0A2540] to-[#041226] text-white rounded-xl p-5 shadow-lg relative overflow-hidden border border-sky-900/50">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-extrabold tracking-wider text-emerald-400 uppercase bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 inline-block mb-1.5">
              100% YOUR APP • LIFETIME OWNED
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                UNLIMITED
              </span>
              <span className="text-xs text-emerald-300 font-semibold">
                $0.00 Bills Forever
              </span>
            </div>
          </div>

          <button
            onClick={onNavigateCall}
            className="w-12 h-12 rounded-full bg-[#10B981] hover:bg-[#059669] text-white flex items-center justify-center shadow-md active:scale-95 transition"
          >
            <Phone className="w-5 h-5 fill-current" />
          </button>
        </div>

        <div className="my-3 border-t border-slate-700/60" />

        <div className="flex items-center justify-between text-xs text-slate-200 mb-4">
          <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero App Subscriptions • No Recurring Software Bills</span>
          </span>
          <span className="text-slate-300 text-[11px] font-medium">
            Airtime: Local SIM Carrier Active
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onNavigateCall}
            className="w-full py-2.5 px-4 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-sm shadow-sm transition active:scale-[0.98] text-center"
          >
            Start a Call
          </button>

          <button
            onClick={onNavigateUpgrade}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-semibold text-sm transition active:scale-[0.98] text-center shadow-sm"
          >
            SIM Airtime & License
          </button>
        </div>
      </div>

      {/* Telephony Quota Usage Meters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-sky-600" />
          <span>Telephony Calling Status</span>
        </h3>

        {/* Minutes meter */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-600">Cellular SIM Airtime Calling</span>
            <span className="font-bold text-emerald-600">
              UNLIMITED (Local Carrier Airtime)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-emerald-100 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full w-full" />
          </div>
        </div>

        {/* Calls meter */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-600">AI Voice Telephony Channels</span>
            <span className="font-bold text-emerald-600">
              UNLIMITED LIFETIME ACCESS
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-emerald-100 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full w-full" />
          </div>
        </div>
      </div>

      {/* Permanent Features included */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-500" />
          <span>Permanent Features Included (100% Owned)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: 'Direct Physical SIM Airtime Dialing', desc: 'Outbound GSM calls use local carrier minutes' },
            { title: 'Sub-400ms Voice Agent Latency', desc: 'Ultra-fast edge audio pipelines & smart synthesis' },
            { title: 'Smart AMD Voicemail Detection', desc: 'Detects answering machines automatically' },
            { title: 'Zero Monthly Software Fees', desc: 'No subscriptions or software bills forever' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">{item.title}</span>
                <span className="text-[11px] text-slate-500">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Airtime billing clarity banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 text-white rounded-xl p-4 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-emerald-500/40">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-400 block">
            100% Owned by You
          </span>
          <p className="text-sm font-bold mt-0.5">
            Zero Software Bills. Only buy airtime from your local SIM provider.
          </p>
        </div>
        <button
          onClick={onNavigateUpgrade}
          className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-sm transition active:scale-95 whitespace-nowrap"
        >
          View Ownership License
        </button>
      </div>
        </>
      )}
    </div>
  );
};
