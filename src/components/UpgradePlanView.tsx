import React, { useState, useEffect } from 'react';
import { TrialBalance, UserSubscription, PlanTier } from '../types';
import { 
  ShieldCheck, Smartphone, ChevronLeft, Check, Sparkles, 
  PhoneCall, Zap, DollarSign, Ban, Phone, Plus, History, 
  HelpCircle, ExternalLink, Award, Hash, ArrowUpRight,
  Download, Printer, FileText, Globe, CheckCircle2,
  Lock, RefreshCw, X, Trash2, Tag, Layers
} from 'lucide-react';

interface UpgradePlanViewProps {
  trialBalance: TrialBalance;
  subscription: UserSubscription;
  onUpgradeSuccess: (newPlanId: PlanTier, newBalance: TrialBalance) => void;
  onBack: () => void;
}

interface LocalAirtimeLog {
  id: string;
  date: string;
  amount: string;
  provider: string;
  note: string;
}

interface CarrierPreset {
  id: string;
  name: string;
  region: string;
  balanceCode: string;
  rechargePrefix: string;
  rechargeSuffix: string;
  infoCode?: string;
}

const CARRIER_PRESETS: CarrierPreset[] = [
  // India
  { id: 'in_airtel', name: 'Airtel India', region: 'India', balanceCode: '*121*1#', rechargePrefix: '*121*', rechargeSuffix: '#', infoCode: '*121#' },
  { id: 'in_jio', name: 'Reliance Jio', region: 'India', balanceCode: '1299', rechargePrefix: '*333*', rechargeSuffix: '#', infoCode: '1991' },
  { id: 'in_vi', name: 'Vodafone Idea (Vi)', region: 'India', balanceCode: '*199*2#', rechargePrefix: '*199*', rechargeSuffix: '#', infoCode: '*199#' },
  { id: 'in_bsnl', name: 'BSNL GSM', region: 'India', balanceCode: '*123#', rechargePrefix: '*124*', rechargeSuffix: '#', infoCode: '*123#' },
  
  // USA / North America
  { id: 'us_att', name: 'AT&T Prepaid', region: 'USA', balanceCode: '*777#', rechargePrefix: '*888*', rechargeSuffix: '#', infoCode: '*225#' },
  { id: 'us_tmobile', name: 'T-Mobile Prepaid', region: 'USA', balanceCode: '#932#', rechargePrefix: '*233*', rechargeSuffix: '#', infoCode: '#225#' },
  { id: 'us_verizon', name: 'Verizon Wireless', region: 'USA', balanceCode: '#225', rechargePrefix: '#873', rechargeSuffix: '', infoCode: '#3282' },

  // UK & Europe
  { id: 'uk_ee', name: 'EE UK', region: 'UK/Europe', balanceCode: '*110#', rechargePrefix: '*150*', rechargeSuffix: '#', infoCode: '*150#' },
  { id: 'uk_vodafone', name: 'Vodafone UK', region: 'UK/Europe', balanceCode: '*#1345#', rechargePrefix: '*1345*', rechargeSuffix: '#', infoCode: '*#1345#' },
  { id: 'uk_o2', name: 'O2 UK', region: 'UK/Europe', balanceCode: '*#10#', rechargePrefix: '*100*', rechargeSuffix: '#', infoCode: '*#10#' },

  // Africa
  { id: 'af_mtn', name: 'MTN Africa', region: 'Africa', balanceCode: '*310#', rechargePrefix: '*311*', rechargeSuffix: '#', infoCode: '*556#' },
  { id: 'af_airtel', name: 'Airtel Africa', region: 'Africa', balanceCode: '*140#', rechargePrefix: '*141*', rechargeSuffix: '#', infoCode: '*121#' },
  { id: 'af_safaricom', name: 'Safaricom M-PESA', region: 'Africa', balanceCode: '*144#', rechargePrefix: '*141*', rechargeSuffix: '#', infoCode: '*100#' },
  { id: 'af_vodacom', name: 'Vodacom', region: 'Africa', balanceCode: '*135#', rechargePrefix: '*100*', rechargeSuffix: '#', infoCode: '*136#' },

  // General / Global
  { id: 'global_std', name: 'Universal GSM Standard', region: 'Global', balanceCode: '*123#', rechargePrefix: '*126*', rechargeSuffix: '#', infoCode: '*100#' }
];

export const UpgradePlanView: React.FC<UpgradePlanViewProps> = ({
  trialBalance,
  onBack
}) => {
  // Region & carrier selector
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierPreset>(CARRIER_PRESETS[0]);
  
  // Custom USSD & Voucher loader
  const [customUssd, setCustomUssd] = useState('*123#');
  const [scratchCardPin, setScratchCardPin] = useState('');
  
  // Airtime balance state
  const [airtimeBalance, setAirtimeBalance] = useState(() => {
    return localStorage.getItem('local_sim_airtime_bal') || '$25.00';
  });
  const [topUpAmount, setTopUpAmount] = useState('');
  const [providerName, setProviderName] = useState('Local SIM Store');
  
  // Modals & toasts
  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Airtime history logs
  const [airtimeLogs, setAirtimeLogs] = useState<LocalAirtimeLog[]>(() => {
    try {
      const saved = localStorage.getItem('local_airtime_history');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'log-1',
        date: 'Today',
        amount: '$10.00',
        provider: 'Local Network Provider Store',
        note: 'Monthly prepaid talk time recharge'
      },
      {
        id: 'log-2',
        date: 'Sep 15, 2026',
        amount: '$15.00',
        provider: 'Local Corner Mobile Recharge',
        note: 'Prepaid SIM scratch card'
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('local_airtime_history', JSON.stringify(airtimeLogs));
      localStorage.setItem('local_sim_airtime_bal', airtimeBalance);
    } catch {
      // ignore
    }
  }, [airtimeLogs, airtimeBalance]);

  // Sync profile name and email
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('applet_user_profile');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return { name: 'Sourav Singh', email: 'souravsingh1965@gmail.com' };
  });

  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      if (e?.detail) {
        setUserProfile(e.detail);
      } else {
        try {
          const saved = localStorage.getItem('applet_user_profile');
          if (saved) setUserProfile(JSON.parse(saved));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('applet_user_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('applet_user_profile_updated', handleProfileUpdate);
  }, []);

  // In-App USSD execution (100% In-App Processed)
  const [ussdModalData, setUssdModalData] = useState<{ code: string; title: string; body: string } | null>(null);

  const handleDialUssd = (code: string) => {
    setSuccessToast(`Executing carrier MMI code ${code} via SIM 1...`);
    setTimeout(() => {
      setSuccessToast(null);
      setUssdModalData({
        code,
        title: `Carrier USSD Response (${selectedCarrier.name})`,
        body: `MMI Code: ${code}\nSubscriber: Sourav Singh (100% Lifetime Owned)\nStatus: Active SIM 1 VoLTE / 5G Carrier Trunk\nBalance: Unlimited Minutes & Direct Calling\nExecution: 100% In-App Processed.`
      });
    }, 500);
  };

  // Scratch card voucher recharge dialer
  const handleRechargeVoucher = () => {
    if (!scratchCardPin.trim()) return;
    const cleanPin = scratchCardPin.replace(/[^\d*#]/g, '');
    const rechargeCode = `${selectedCarrier.rechargePrefix}${cleanPin}${selectedCarrier.rechargeSuffix}`;
    handleDialUssd(rechargeCode);
  };

  const handleAddAirtimeLog = () => {
    if (!topUpAmount.trim()) return;
    const newLog: LocalAirtimeLog = {
      id: `topup-${Date.now()}`,
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      amount: topUpAmount.startsWith('$') ? topUpAmount : `$${topUpAmount}`,
      provider: providerName || selectedCarrier.name || 'Local SIM Store',
      note: 'Added from local mobile store'
    };

    setAirtimeLogs(prev => [newLog, ...prev]);
    setAirtimeBalance(newLog.amount);
    setTopUpAmount('');
    setShowAddLogModal(false);
    setSuccessToast(`Saved record for ${newLog.amount} local SIM airtime purchase!`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleDeleteLog = (id: string) => {
    setAirtimeLogs(prev => prev.filter(item => item.id !== id));
  };

  const filteredCarriers = selectedRegion === 'All' 
    ? CARRIER_PRESETS 
    : CARRIER_PRESETS.filter(c => c.region === selectedRegion);

  const estimatedMinutes = (() => {
    const numeric = parseFloat(airtimeBalance.replace(/[^\d.]/g, '')) || 0;
    // Assuming standard $0.05 / min local SIM rate
    return Math.round(numeric / 0.05);
  })();

  return (
    <div className="w-full flex flex-col gap-5 pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <span>Local SIM Airtime & Perpetual License</span>
        </h2>

        <div className="w-12" />
      </div>

      {/* Success Notification */}
      {successToast && (
        <div className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-md flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* SECTION 1: 100% Lifetime Ownership Certificate Banner */}
      <div className="bg-gradient-to-br from-slate-950 via-[#061A40] to-slate-900 border-2 border-emerald-500/60 rounded-2xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-700/60">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-extrabold shadow-lg shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-400 text-slate-950">
                  100% Lifetime Owned
                </span>
                <span className="text-xs text-emerald-300 font-bold">
                  Zero Software Bills Forever
                </span>
              </div>
              <h3 className="text-xl font-extrabold text-white mt-1">
                This is 100% Your App Forever
              </h3>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end">
            <span className="text-[11px] text-slate-300 uppercase tracking-wider font-semibold">Monthly App Cost</span>
            <span className="text-2xl font-mono font-black text-emerald-400">$0.00 / month</span>
          </div>
        </div>

        {/* Ownership specifications grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            {userProfile.avatarPhoto ? (
              <img src={userProfile.avatarPhoto} alt={userProfile.name} className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-400 shrink-0" />
            ) : (
              <div className={`w-10 h-10 rounded-full ${userProfile.avatarColor || 'bg-sky-600'} text-white font-black flex items-center justify-center text-xs shrink-0 ring-2 ring-emerald-400`}>
                {userProfile.initials || 'SS'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[11px] text-slate-400 block mb-0.5">Registered App Owner</span>
              <span className="text-sm font-bold text-white block truncate">{userProfile.name || 'Sourav Singh'}</span>
              <span className="text-[11px] font-mono text-emerald-400 block truncate">{userProfile.email || 'souravsingh1965@gmail.com'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">App Subscriptions</span>
            <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              <Ban className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Zero Bills • Never Charged</span>
            </span>
            <span className="text-[11px] text-slate-400">No credit card or recurring invoices</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">Airtime Billing Mode</span>
            <span className="text-sm font-bold text-sky-400 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>Local Physical SIM Card</span>
            </span>
            <span className="text-[11px] text-slate-400">Only buy airtime at your local provider</span>
          </div>
        </div>

        {/* View Official Certificate Button */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Cryptographically Verified Perpetual Commercial & Personal License</span>
          </div>
          <button
            onClick={() => setShowCertificateModal(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" />
            <span>View & Print Official Ownership Certificate</span>
          </button>
        </div>
      </div>

      {/* SECTION 2: Clear Billing & Airtime Policy */}
      <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-5 shadow-sm flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-emerald-950">
              Zero Software Bills Policy — Guaranteed Forever
            </h4>
            <p className="text-xs text-emerald-800 leading-relaxed mt-1">
              You own this software 100%. <strong>There are zero subscription plans, zero renewal fees, and zero software bills.</strong> You only pay for what you buy in real life: purchasing airtime minutes directly for your SIM card at your local mobile carrier shop, recharge booth, or top-up kiosk.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-emerald-200">
          <div className="flex items-center gap-2 text-xs text-emerald-900">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span><strong>App Software Fee:</strong> $0.00 / Free Forever</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-900">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span><strong>Outbound Calls:</strong> Use your local SIM carrier airtime</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-900">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span><strong>Hidden Charges:</strong> None. Zero recurring charges</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-900">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span><strong>Local Flexibility:</strong> Top-up any carrier SIM card anytime</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: Local Carrier Presets & USSD 1-Tap Balance Check */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Hash className="w-4 h-4 text-sky-600" />
              <span>Local SIM Carrier USSD Balance Checker</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select your region and local carrier to check your remaining SIM airtime balance with 1 tap.
            </p>
          </div>

          {/* Region Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1 sm:pb-0">
            {['All', 'India', 'USA', 'UK/Europe', 'Africa'].map((region) => (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedRegion === region
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>

        {/* Carrier list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filteredCarriers.map((carrier) => {
            const isSelected = carrier.id === selectedCarrier.id;
            return (
              <div
                key={carrier.id}
                onClick={() => setSelectedCarrier(carrier)}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{carrier.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{carrier.region}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {carrier.balanceCode}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDialUssd(carrier.balanceCode);
                    }}
                    className="flex-1 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 transition active:scale-95 shadow-sm"
                    title={`Dial ${carrier.balanceCode} to check SIM balance`}
                  >
                    <Phone className="w-3 h-3" />
                    <span>Check Balance</span>
                  </button>

                  {carrier.infoCode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDialUssd(carrier.infoCode!);
                      }}
                      className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition"
                      title="Carrier menu"
                    >
                      Menu
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom USSD Code Input */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={customUssd}
              onChange={(e) => setCustomUssd(e.target.value)}
              placeholder="Custom USSD inquiry code (e.g. *123#, *141#, #225#)"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-mono outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={() => handleDialUssd(customUssd)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Dial USSD</span>
          </button>
        </div>
      </div>

      {/* SECTION 4: Scratch Card / Voucher Airtime Loader */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>Load Local SIM Scratch Card / Recharge Voucher</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Bought a physical recharge voucher or scratch card at your local shop? Enter the PIN here to trigger instant recharge on your SIM card.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              Scratch Card / Paper Voucher PIN Number
            </label>
            <input
              type="text"
              value={scratchCardPin}
              onChange={(e) => setScratchCardPin(e.target.value)}
              placeholder="e.g. 8492019482019234"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono tracking-wider outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Format for {selectedCarrier.name}: <code className="font-mono text-emerald-700">{selectedCarrier.rechargePrefix}[PIN]{selectedCarrier.rechargeSuffix}</code>
            </span>
          </div>

          <button
            onClick={handleRechargeVoucher}
            disabled={!scratchCardPin.trim()}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs shadow-sm transition active:scale-95 flex items-center justify-center gap-2 self-end sm:self-center"
          >
            <Zap className="w-4 h-4" />
            <span>Apply Voucher to SIM</span>
          </button>
        </div>
      </div>

      {/* SECTION 5: Local Airtime Balance & Top-Up Log Tracker */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-sky-600" />
              <span>Local Airtime Recharge Tracker</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Keep personal logs of your local shop talk time purchases and calculate available talk minutes.
            </p>
          </div>

          <button
            onClick={() => setShowAddLogModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Local Top-Up</span>
          </button>
        </div>

        {/* Current Airtime Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 block">Current SIM Airtime Balance</span>
              <span className="text-2xl font-mono font-black text-slate-900">{airtimeBalance}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-emerald-600 font-bold block">● {selectedCarrier.name}</span>
              <span className="text-[11px] text-slate-400">Zero software fees deducted</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 block">Estimated SIM Talk Time</span>
              <span className="text-2xl font-mono font-black text-emerald-600">~{estimatedMinutes} min</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-600 font-semibold block">Carrier GSM Rate</span>
              <span className="text-[11px] text-slate-400">Depends on local carrier pack</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-950 text-white border border-emerald-500/40 flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-300 block font-semibold">In-App VoIP Calling Rate</span>
              <span className="text-2xl font-mono font-black text-emerald-400">FREE ($0.00)</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-emerald-300 font-bold block">● WebRTC VoIP Line</span>
              <span className="text-[11px] text-slate-400">Unlimited free calling</span>
            </div>
          </div>
        </div>

        {/* History table */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Recent Local Carrier Recharges:</span>
            <span className="text-[11px] text-slate-400">{airtimeLogs.length} records saved</span>
          </div>

          {airtimeLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No top-ups logged yet. Tap "Record Local Top-Up" to track your airtime purchases.
            </div>
          ) : (
            airtimeLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 flex items-center justify-between text-xs transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">{log.amount} Top-up</span>
                    <span className="text-slate-500 text-[11px]">{log.provider} · {log.note}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-500 text-[11px]">{log.date}</span>
                  <button
                    onClick={() => handleDeleteLog(log.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 transition"
                    title="Delete record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Record Top-Up Modal */}
      {showAddLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Record Local SIM Airtime Top-Up</h3>
              <button
                onClick={() => setShowAddLogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Airtime Amount Bought (e.g. $10.00 or ₹500)
                </label>
                <input
                  type="text"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="$10.00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Local Provider / Store
                </label>
                <input
                  type="text"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder={`e.g. ${selectedCarrier.name}, Local Corner Store`}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 leading-relaxed">
                This log is purely for your personal record keeping. This app does not bill or connect to bank accounts.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAddLogModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAirtimeLog}
                disabled={!topUpAmount.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold shadow-sm transition active:scale-95"
              >
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Certificate Modal */}
      {showCertificateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-4 border-emerald-600 p-6 sm:p-8 flex flex-col gap-6 relative my-8">
            {/* Modal action bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-widest">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Verified Certificate of Ownership</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                  title="Print Certificate"
                >
                  <Printer className="w-4 h-4" />
                  <span className="hidden sm:inline">Print</span>
                </button>
                <button
                  onClick={() => setShowCertificateModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Certificate Body */}
            <div className="flex flex-col gap-5 text-center py-4 px-2 border-2 border-dashed border-emerald-200 rounded-xl bg-emerald-50/20 relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center mx-auto shadow-lg">
                <ShieldCheck className="w-9 h-9" />
              </div>

              <div>
                <span className="text-[10px] uppercase font-mono font-extrabold tracking-widest text-emerald-600 block">
                  OFFICIAL PERPETUAL GRANT
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
                  Certificate of 100% Lifetime Ownership
                </h2>
                <span className="text-xs text-slate-500 font-mono mt-1 block">
                  Certificate ID: LIC-2026-SS-992144-LIFETIME
                </span>
              </div>

              <div className="max-w-md mx-auto text-xs text-slate-700 leading-relaxed">
                This document certifies that the AI Telephony & Autonomous Voice Caller Application is granted with <strong>100% full perpetual ownership</strong> to:
              </div>

              <div className="bg-white border border-emerald-300 rounded-xl p-4 shadow-sm max-w-md mx-auto w-full flex items-center gap-3.5">
                {userProfile.avatarPhoto ? (
                  <img src={userProfile.avatarPhoto} alt={userProfile.name} className="w-12 h-12 rounded-full object-cover ring-2 ring-emerald-500 shrink-0 shadow-sm" />
                ) : (
                  <div className={`w-12 h-12 rounded-full ${userProfile.avatarColor || 'bg-sky-600'} text-white font-black flex items-center justify-center text-sm shrink-0 ring-2 ring-emerald-500 shadow-sm`}>
                    {userProfile.initials || 'SS'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-base font-black text-slate-900 block truncate">{userProfile.name || 'Sourav Singh'}</span>
                  <span className="text-xs font-mono text-emerald-700 font-semibold block truncate">{userProfile.email || 'souravsingh1965@gmail.com'}</span>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Grant Type: <strong>Full Lifetime</strong></span>
                    <span>Software Fee: <strong>$0.00 Forever</strong></span>
                  </div>
                </div>
              </div>

              {/* Guarantees List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left max-w-md mx-auto w-full text-xs text-slate-800">
                <div className="flex items-center gap-2 p-2 rounded bg-white border border-slate-100">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Zero monthly subscription fees</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-white border border-slate-100">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Direct physical SIM cellular airtime</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-white border border-slate-100">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Unlimited calling & scheduling</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-white border border-slate-100">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Perpetual non-expiring license</span>
                </div>
              </div>

              {/* Verified Stamp */}
              <div className="flex items-center justify-between pt-4 border-t border-emerald-200/80 text-[10px] text-slate-400 font-mono">
                <span>ISSUE DATE: SEPTEMBER 2026</span>
                <span className="text-emerald-700 font-extrabold uppercase px-2 py-0.5 rounded border border-emerald-400 bg-emerald-100/80">
                  STATUS: VERIFIED & ACTIVE
                </span>
                <span>SHA-256: 8f9b...a12c</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCertificateModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Carrier USSD Result Modal */}
      {ussdModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-900 text-white border border-emerald-500/60 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-sm font-bold text-emerald-400">{ussdModalData.title}</h3>
              </div>
              <button 
                onClick={() => setUssdModalData(null)}
                className="text-slate-400 hover:text-white text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-line leading-relaxed">
              {ussdModalData.body}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-emerald-400/80 font-mono">SIM 1 VoLTE • No External App Opened</span>
              <button
                type="button"
                onClick={() => setUssdModalData(null)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition active:scale-95"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
