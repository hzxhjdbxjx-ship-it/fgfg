import React, { useState } from 'react';
import { CallLog } from '../types';
import { 
  PhoneCall, Zap, TrendingUp, DollarSign, Clock, CheckCircle2, 
  ArrowUpRight, Users, ShieldCheck, ChevronRight
} from 'lucide-react';

interface DashboardProps {
  calls: CallLog[];
  onViewCallDetail: (call: CallLog) => void;
  onNavigateTab: (tab: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  calls,
  onViewCallDetail,
  onNavigateTab
}) => {
  // ROI Calculator states
  const [repCount, setRepCount] = useState(8);
  const [callsPerRepPerDay, setCallsPerRepPerDay] = useState(45);
  const [hourlyWage, setHourlyWage] = useState(28);

  // Calculations
  const monthlyCalls = repCount * callsPerRepPerDay * 22;
  const humanMonthlyCost = repCount * hourlyWage * 160;
  const aiMonthlyCost = monthlyCalls * 0.12; // $0.12 average AI call
  const monthlySavings = Math.max(0, humanMonthlyCost - aiMonthlyCost);
  const savingsPercent = Math.round((monthlySavings / humanMonthlyCost) * 100);

  // Metrics
  const totalCalls = 14892 + calls.length;
  const connectRate = 84.6;
  const avgLatency = 342;
  const totalMinutes = 62480;

  // Chart data: 7-day call volume
  const volumeData = [
    { day: 'Mon', inbound: 980, outbound: 1420 },
    { day: 'Tue', inbound: 1120, outbound: 1680 },
    { day: 'Wed', inbound: 1240, outbound: 1890 },
    { day: 'Thu', inbound: 1190, outbound: 1750 },
    { day: 'Fri', inbound: 1050, outbound: 1540 },
    { day: 'Sat', inbound: 420, outbound: 560 },
    { day: 'Sun', inbound: 310, outbound: 480 },
  ];
  const maxVolume = 3200;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Calls Processed</span>
            <div className="p-1.5 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {totalCalls.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+18.4% vs last week</span>
            </div>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Avg Response Latency</span>
            <div className="p-1.5 rounded-lg bg-indigo-950/60 text-indigo-400 border border-indigo-800/40">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {avgLatency} ms
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-400">
              <span>Sub-400ms Edge Standard</span>
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Live Connect Rate</span>
            <div className="p-1.5 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {connectRate}%
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
              <span>AMD Accurate Detection</span>
            </div>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Cost per AI Call</span>
            <div className="p-1.5 rounded-lg bg-amber-950/60 text-amber-400 border border-amber-800/40">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              $0.08
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-400">
              <span>96% less than human agent ($4.20)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts & Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Call Volume Chart (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Weekly Telephony Volume</h3>
                <p className="text-xs text-slate-400">Outbound robo campaigns vs inbound IVR inquiries</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
                  <span className="text-slate-300">Outbound</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                  <span className="text-slate-300">Inbound</span>
                </div>
              </div>
            </div>

            {/* SVG Bar Chart */}
            <div className="w-full h-56 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-slate-800">
              {volumeData.map((item, idx) => {
                const total = item.inbound + item.outbound;
                const totalHeightPct = Math.round((total / maxVolume) * 100);
                const outboundPct = Math.round((item.outbound / total) * 100);
                const inboundPct = 100 - outboundPct;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                    <div className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition tabular-nums">
                      {total.toLocaleString()}
                    </div>
                    <div 
                      className="w-full max-w-[42px] rounded-t flex flex-col overflow-hidden bg-slate-800 transition-all duration-300 group-hover:brightness-110"
                      style={{ height: `${totalHeightPct}%` }}
                    >
                      <div 
                        className="bg-cyan-500 w-full"
                        style={{ height: `${outboundPct}%` }}
                        title={`Outbound: ${item.outbound}`}
                      />
                      <div 
                        className="bg-indigo-600 w-full"
                        style={{ height: `${inboundPct}%` }}
                        title={`Inbound: ${item.inbound}`}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400 mt-1">{item.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 text-xs">
            <div>
              <span className="text-slate-500 block">Peak Concurrency</span>
              <span className="font-mono text-sm font-semibold text-slate-200">64 Active Lines</span>
            </div>
            <div>
              <span className="text-slate-500 block">Avg Call Duration</span>
              <span className="font-mono text-sm font-semibold text-slate-200">1m 48s</span>
            </div>
            <div>
              <span className="text-slate-500 block">Voicemail Detection Rate</span>
              <span className="font-mono text-sm font-semibold text-slate-200">99.1% AMD</span>
            </div>
          </div>
        </div>

        {/* Call Disposition & Sentiment breakdown (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Call Dispositions</h3>
            <p className="text-xs text-slate-400 mb-4">Outcomes across 14k+ conversations</p>

            <div className="flex flex-col gap-3">
              {[
                { label: 'Completed (Goal Achieved)', pct: 74, color: 'bg-emerald-500' },
                { label: 'Voicemail Left (AMD)', pct: 14, color: 'bg-cyan-500' },
                { label: 'Transferred to Human', pct: 8, color: 'bg-indigo-500' },
                { label: 'Busy / Unreachable', pct: 4, color: 'bg-slate-600' },
              ].map((item, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="font-mono tabular-nums text-slate-400 font-semibold">{item.pct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div 
                      className={`h-full ${item.color} rounded-full`}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 mt-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">Carrier STIR/SHAKEN A-Grade Attestation</span>
            </div>
          </div>
        </div>
      </div>

      {/* ROI & Human Agent Replacement Calculator */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Enterprise Cost & ROI Calculator</span>
            </h3>
            <p className="text-xs text-slate-400">
              Calculate projected monthly savings compared to legacy human call centers
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Estimated Cost Reduction:</span>
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              {savingsPercent}% Savings
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5">
          {/* Sliders (2 cols on lg) */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            {/* Slider 1 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">Number of Full-Time Reps</span>
                <span className="font-mono font-semibold text-cyan-400 tabular-nums">{repCount} Reps</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={repCount}
                onChange={(e) => setRepCount(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Slider 2 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">Calls per Rep / Day</span>
                <span className="font-mono font-semibold text-cyan-400 tabular-nums">{callsPerRepPerDay} Calls</span>
              </div>
              <input
                type="range"
                min="10"
                max="120"
                value={callsPerRepPerDay}
                onChange={(e) => setCallsPerRepPerDay(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Slider 3 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">Average Rep Hourly Wage</span>
                <span className="font-mono font-semibold text-cyan-400 tabular-nums">${hourlyWage} / hr</span>
              </div>
              <input
                type="range"
                min="18"
                max="65"
                value={hourlyWage}
                onChange={(e) => setHourlyWage(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Outcome Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex flex-col gap-3">
              <div>
                <span className="text-[11px] text-slate-500 uppercase tracking-wider block">
                  Human Labor Cost (Monthly)
                </span>
                <span className="text-lg font-mono line-through text-slate-500 tabular-nums">
                  ${humanMonthlyCost.toLocaleString()}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-emerald-400 uppercase tracking-wider block font-semibold">
                  RoboVoiceCall Cost (Monthly)
                </span>
                <span className="text-xl font-mono text-cyan-400 font-bold tabular-nums">
                  ${Math.round(aiMonthlyCost).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  ({monthlyCalls.toLocaleString()} calls @ $0.12/call)
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 mt-2">
              <span className="text-xs text-slate-400 block">Net Monthly Savings:</span>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                +${Math.round(monthlySavings).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Live Call Log Quick Snippets */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Recent Call Activity</h3>
          <button
            onClick={() => onNavigateTab('logs')}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
          >
            <span>View Full Transcripts</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 font-medium">Caller / Number</th>
                <th className="py-2.5 font-medium">Agent</th>
                <th className="py-2.5 font-medium">Disposition</th>
                <th className="py-2.5 font-medium">Duration</th>
                <th className="py-2.5 font-medium">Sentiment</th>
                <th className="py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {calls.slice(0, 4).map((call) => (
                <tr key={call.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 font-sans">
                    <div className="font-medium text-slate-200">{call.callerName}</div>
                    <div className="font-mono text-[11px] text-slate-500">{call.callerNumber}</div>
                  </td>
                  <td className="py-3 font-sans text-slate-300">{call.agentName}</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                      {call.disposition}
                    </span>
                  </td>
                  <td className="py-3 tabular-nums text-slate-300">{call.durationSeconds}s</td>
                  <td className="py-3 font-sans capitalize">
                    <span className={`text-xs ${
                      call.sentiment === 'positive' ? 'text-emerald-400' :
                      call.sentiment === 'urgent' ? 'text-rose-400' : 'text-slate-300'
                    }`}>
                      {call.sentiment}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => onViewCallDetail(call)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-sans transition"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
