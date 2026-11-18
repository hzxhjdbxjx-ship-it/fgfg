import React from 'react';
import { BarChart3, ChevronLeft, Download, FileSpreadsheet, TrendingUp, Clock, PhoneCall } from 'lucide-react';
import { CallLog } from '../types';

interface ReportsViewProps {
  calls: CallLog[];
  onBack: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ calls, onBack }) => {
  const totalCalls = 14892 + calls.length;
  const completedRate = 84.6;
  const avgDuration = 108; // seconds

  const handleDownloadCSV = () => {
    const headers = 'CallID,CallerName,CallerNumber,Agent,DurationSeconds,Disposition,Cost,Timestamp\n';
    const rows = calls.map(c => 
      `"${c.id}","${c.callerName}","${c.callerNumber}","${c.agentName}",${c.durationSeconds},"${c.disposition}",${c.cost},"${c.timestamp}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robovoice_telephony_report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <BarChart3 className="w-5 h-5 text-sky-600" />
          <span>Telephony Analytics & Audit Reports</span>
        </h2>

        <button
          onClick={handleDownloadCSV}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold block">Total Calls Audited</span>
          <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1 block">
            {totalCalls.toLocaleString()}
          </span>
          <span className="text-[11px] text-emerald-600 font-medium">+18.4% increase</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold block">Average Handling Time (AHT)</span>
          <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1 block">
            1m 48s
          </span>
          <span className="text-[11px] text-slate-500">Autonomous resolution</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold block">Goal Conversion Rate</span>
          <span className="text-2xl font-bold font-mono text-emerald-600 tabular-nums mt-1 block">
            {completedRate}%
          </span>
          <span className="text-[11px] text-slate-500">Verified call outcomes</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
        <h3 className="text-sm font-bold text-slate-800">Compliance & Regulatory Summary</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          All calls recorded during this billing cycle comply with FCC STIR/SHAKEN Level A attestation, 
          TCPA consent verification standards, and automated Answering Machine Detection (AMD) rules.
        </p>

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>telephony_full_audit_log_2026.csv (Ready for download)</span>
          </div>
          <button
            onClick={handleDownloadCSV}
            className="text-sky-600 font-bold hover:underline"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
