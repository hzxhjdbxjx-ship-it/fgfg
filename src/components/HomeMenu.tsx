import React from 'react';
import { AppView, TrialBalance } from '../types';
import {
  Phone, PhoneCall, History, Users, Headphones, Calendar,
  RotateCw, MessageSquare, BarChart3, Network, Volume2,
  Smartphone, Settings, ChevronRight, Gauge, Radio,
  ShieldCheck, Check, Edit2, CheckCheck, Wifi, WifiOff
} from 'lucide-react';

interface HomeMenuProps {
  trialBalance: TrialBalance;
  callHistoryCount: number;
  contactsCount: number;
  myNumber?: string;
  wsConnected?: boolean;
  onlinePeersCount?: number;
  onUpdateMyNumber?: (num: string) => void;
  onNavigate: (view: AppView, tab?: 'audio' | 'contacts' | 'schedule' | 'interval' | 'rules', autoDialNow?: boolean) => void;
  onRecordVideoWalkthrough?: () => void;
}

export const HomeMenu: React.FC<HomeMenuProps> = ({
  trialBalance,
  callHistoryCount,
  contactsCount,
  myNumber = '',
  wsConnected = false,
  onlinePeersCount = 0,
  onUpdateMyNumber,
  onNavigate,
  onRecordVideoWalkthrough
}) => {
  const [userProfile, setUserProfile] = React.useState(() => {
    try {
      const saved = localStorage.getItem('applet_user_profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { name: 'Sourav Singh', email: 'souravsingh1965@gmail.com', initials: 'SS', avatarColor: 'bg-sky-600' };
  });

  React.useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      if (e?.detail) setUserProfile(e.detail);
      else {
        try {
          const s = localStorage.getItem('applet_user_profile');
          if (s) setUserProfile(JSON.parse(s));
        } catch {}
      }
    };
    window.addEventListener('applet_user_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('applet_user_profile_updated', handleProfileUpdate);
  }, []);

  const [isEditingCallerId, setIsEditingCallerId] = React.useState(!myNumber);
  const [newCallerIdInput, setNewCallerIdInput] = React.useState(myNumber);
  const [saveCallerIdSuccess, setSaveCallerIdSuccess] = React.useState(false);

  React.useEffect(() => {
    setNewCallerIdInput(myNumber);
    if (myNumber) setIsEditingCallerId(false);
  }, [myNumber]);

  const handleSaveCallerId = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newCallerIdInput.trim();
    if (!clean) return;
    if (onUpdateMyNumber) {
      onUpdateMyNumber(clean);
    } else {
      try {
        localStorage.setItem('applet_caller_id', clean);
      } catch {}
    }
    setIsEditingCallerId(false);
    setSaveCallerIdSuccess(true);
    setTimeout(() => setSaveCallerIdSuccess(false), 2500);
  };

  const menuItems: {
    id: AppView;
    label: string;
    icon: React.ReactNode;
    count?: string | number;
    badge?: string;
  }[] = [
    {
      id: 'live_connect',
      label: 'Connect Live Call',
      icon: <Radio className="w-5 h-5 text-emerald-600" />,
      badge: 'ORIGINAL VOICE'
    },
    {
      id: 'dashboard',
      label: 'Trial Dashboard',
      icon: <Gauge className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'call',
      label: 'Automatic Dialing Numbers',
      icon: <PhoneCall className="w-5 h-5 text-emerald-600" />,
      badge: 'AUTO-DIAL QUEUE'
    },
    {
      id: 'history',
      label: 'Call History',
      icon: <History className="w-5 h-5 text-sky-600" />,
      count: callHistoryCount
    },
    {
      id: 'contacts',
      label: 'Contacts',
      icon: <Users className="w-5 h-5 text-sky-600" />,
      count: contactsCount.toLocaleString()
    },
    {
      id: 'voice',
      label: 'Voice Profiles',
      icon: <Headphones className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'campaigns',
      label: 'Campaigns',
      icon: <Phone className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'schedule',
      label: 'Campaign Scheduler',
      icon: <Calendar className="w-5 h-5 text-emerald-600" />,
      badge: '5-STEP WORKFLOW'
    },
    {
      id: 'retry',
      label: 'Auto Retry',
      icon: <RotateCw className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'sms',
      label: 'Auto SMS',
      icon: <MessageSquare className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'ivr',
      label: 'IVR Menu',
      icon: <Network className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'audio',
      label: 'Upload Audio & MP3',
      icon: <Volume2 className="w-5 h-5 text-sky-600" />,
      badge: 'PHONE UPLOAD'
    },
    {
      id: 'sim',
      label: 'SIM & Cellular Config',
      icon: <Smartphone className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'upgrade',
      label: 'Account & License',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
      badge: '100% OWNED'
    },
    {
      id: 'permissions',
      label: 'Permissions & Call Troubleshooter',
      icon: <ShieldCheck className="w-5 h-5 text-blue-600" />,
      badge: 'FIX CALLING'
    },
    {
      id: 'telephony',
      label: 'Virtual Numbers & SIP Trunks',
      icon: <Radio className="w-5 h-5 text-sky-600" />
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5 text-sky-600" />
    }
  ];

  return (
    <div className="w-full flex flex-col gap-3 pb-8">
      {/* Top Card */}
      <div className="w-full bg-gradient-to-br from-[#061A40] via-[#0B2545] to-[#041226] text-white rounded-xl p-5 shadow-lg relative overflow-hidden border border-sky-900/40">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-extrabold tracking-wider text-emerald-400 uppercase bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 inline-block mb-1.5">
              100% IN-APP ORIGINAL VOICE CALLING
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white">
                {trialBalance.planName === '100% Lifetime Owned' ? 'LIVE P2P' : trialBalance.planName}
              </span>
              <span className="text-xs text-emerald-300 font-semibold">
                Real Human Mic-to-Speaker
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              try {
                localStorage.setItem('applet_calling_engine', 'webrtc');
              } catch {}
              onNavigate('live_connect');
            }}
            title="Open Original Live Dialer"
            className="w-12 h-12 rounded-full bg-[#10B981] hover:bg-[#059669] text-white flex items-center justify-center shadow-md active:scale-95 transition group cursor-pointer"
          >
            <Phone className="w-5 h-5 fill-current group-hover:rotate-12 transition-transform" />
          </button>
        </div>

        <div className="my-3 border-t border-slate-700/60" />

        {/* Live WebSocket Registration & My Number Card */}
        <div className="mb-3 rounded-xl bg-slate-900/90 border border-emerald-500/40 p-3 text-slate-200 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
            <span className={`font-bold flex items-center gap-1.5 ${wsConnected ? 'text-emerald-400' : 'text-amber-300'}`}>
              {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>
                {wsConnected
                  ? `Signaling Online • ${onlinePeersCount} Peer(s) Online`
                  : 'Connecting to Live Call Server...'}
              </span>
            </span>
            <span className="text-[10px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {myNumber ? 'Reachable for Incoming Calls' : 'Register Number Below'}
            </span>
          </div>

          <div className="flex items-center justify-between bg-black/40 px-3 py-2 rounded-lg border border-slate-700/60 text-xs">
            {isEditingCallerId ? (
              <form onSubmit={handleSaveCallerId} className="flex items-center gap-2 w-full">
                <span className="text-slate-400 text-[11px] shrink-0">My Number:</span>
                <input
                  type="text"
                  value={newCallerIdInput}
                  onChange={(e) => setNewCallerIdInput(e.target.value)}
                  placeholder="Enter your number to receive calls..."
                  className="flex-1 px-2.5 py-1 text-xs font-mono bg-slate-800 text-white border border-emerald-400 rounded focus:outline-none min-w-0"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded transition active:scale-95 cursor-pointer shrink-0"
                >
                  Save
                </button>
                {myNumber && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewCallerIdInput(myNumber);
                      setIsEditingCallerId(false);
                    }}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] rounded cursor-pointer shrink-0"
                  >
                    Cancel
                  </button>
                )}
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 text-[11px]">My Number:</span>
                  <span className="font-mono font-bold text-emerald-300 text-xs tracking-wide truncate">
                    {myNumber}
                  </span>
                  {saveCallerIdSuccess && (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                      <CheckCheck className="w-3 h-3" />
                      <span>Online</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewCallerIdInput(myNumber);
                    setIsEditingCallerId(true);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Edit2 className="w-3 h-3 text-sky-400" />
                  <span>Change</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-200 mb-4">
          <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% Real Voice Only (Zero Simulated Calls)</span>
          </span>
          <span className="text-slate-300 text-[11px] font-medium">
            In-App WebRTC P2P
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={() => {
              try {
                localStorage.setItem('applet_calling_engine', 'webrtc');
              } catch {}
              onNavigate('call', undefined, true);
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg transition active:scale-[0.98] text-center flex items-center justify-center gap-2 cursor-pointer"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Automatic Dialing Numbers</span>
          </button>

          <button
            onClick={() => {
              try {
                localStorage.setItem('applet_calling_engine', 'webrtc');
              } catch {}
              onNavigate('live_connect', undefined, false);
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-extrabold text-sm shadow-md transition active:scale-[0.98] text-center flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-500/40"
          >
            <Phone className="w-4 h-4 text-emerald-400" />
            <span>Original Live Dialer</span>
          </button>

          <button
            onClick={() => onNavigate('dashboard')}
            className="sm:w-auto py-2.5 px-4 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-white font-semibold text-sm transition active:scale-[0.98] text-center"
          >
            Dashboard
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-700/60">
          <button
            onClick={() => onNavigate('audio')}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-sky-950/70 border border-sky-500/50 hover:bg-sky-900/70 text-sky-200 text-xs font-semibold active:scale-95 transition text-center"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">Upload Audio & MP3</span>
          </button>
          <button
            onClick={() => onNavigate('permissions')}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-950/70 border border-emerald-500/50 hover:bg-emerald-900/70 text-emerald-200 text-xs font-semibold active:scale-95 transition text-center cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Call Troubleshooter</span>
          </button>
        </div>
      </div>

      {/* 5-Step Campaign Workflow Card */}
      <div
        onClick={() => onNavigate('schedule')}
        className="w-full bg-gradient-to-r from-emerald-900 via-slate-900 to-[#0B2545] border border-emerald-500/40 rounded-xl p-4 text-white shadow-md cursor-pointer hover:border-emerald-400 transition group active:scale-[0.99]"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              5-Step Campaign Guide
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-300 group-hover:text-emerald-300 transition flex items-center gap-0.5">
            <span>Open Scheduler</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>

        <p className="text-xs text-slate-200 mb-3 font-medium">
          Scheduled sequential calling workflow using your uploaded audio and contact list.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate('schedule', 'audio'); }}
            className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg border border-slate-700/80 flex items-center gap-1.5 text-left transition cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full bg-sky-500 text-slate-950 font-bold text-[9px] flex items-center justify-center shrink-0">1</span>
            <span className="text-slate-300 truncate">Upload Audio</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate('schedule', 'contacts'); }}
            className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg border border-slate-700/80 flex items-center gap-1.5 text-left transition cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full bg-sky-500 text-slate-950 font-bold text-[9px] flex items-center justify-center shrink-0">2</span>
            <span className="text-slate-300 truncate">Add Contacts</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate('schedule', 'schedule'); }}
            className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg border border-slate-700/80 flex items-center gap-1.5 text-left transition cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full bg-emerald-400 text-slate-950 font-bold text-[9px] flex items-center justify-center shrink-0">3</span>
            <span className="text-emerald-300 truncate">Schedule Date</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate('schedule', 'interval'); }}
            className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg border border-slate-700/80 flex items-center gap-1.5 text-left transition cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full bg-sky-500 text-slate-950 font-bold text-[9px] flex items-center justify-center shrink-0">4</span>
            <span className="text-slate-300 truncate">Call Interval</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate('schedule', 'rules'); }}
            className="bg-rose-950/80 hover:bg-rose-900 border border-rose-500/70 p-2 rounded-lg flex items-center gap-1.5 text-left transition cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center shrink-0">5</span>
            <span className="text-rose-300 font-bold truncate">Record Video</span>
          </button>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <span className="text-[11px] text-emerald-300 font-medium">
            Record or monitor automated sequential calling directly inside this app
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onRecordVideoWalkthrough) onRecordVideoWalkthrough();
                else onNavigate('schedule', 'rules');
              }}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
            >
              <span>Record 5-Step Video</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNavigate('schedule', 'rules'); }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center transition cursor-pointer"
            >
              <span>Controls</span>
            </button>
          </div>
        </div>
      </div>

      {/* Vertical Navigation Menu */}
      <div className="flex flex-col gap-2">
        {menuItems.map((item) => {
          const isDirectCall = item.id === 'live_connect' || item.id === 'call';
          return (
            <button
              key={`${item.id}-${item.label}`}
              onClick={() => onNavigate(item.id)}
              className={`w-full border rounded-xl px-4 py-3 flex items-center justify-between shadow-sm transition group active:scale-[0.99] ${
                isDirectCall
                  ? 'bg-gradient-to-r from-emerald-50/70 to-white border-emerald-300 hover:border-emerald-400'
                  : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  item.id === 'settings'
                    ? `${userProfile.avatarColor || 'bg-sky-600'} text-white font-bold text-xs shadow-sm`
                    : isDirectCall
                      ? 'bg-emerald-100'
                      : 'bg-[#E0F2FE]'
                }`}>
                  {item.id === 'settings' ? (
                    userProfile.avatarPhoto ? (
                      <img
                        src={userProfile.avatarPhoto}
                        alt={userProfile.name}
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : (
                      <span>{userProfile.initials || 'SS'}</span>
                    )
                  ) : (
                    item.icon
                  )}
                </div>
                <div className="text-left">
                  <span className={`text-sm font-semibold transition-colors block ${
                    isDirectCall
                      ? 'text-emerald-900 group-hover:text-emerald-700 font-bold'
                      : 'text-slate-800 group-hover:text-sky-600'
                  }`}>
                    {item.label}
                  </span>
                  {item.id === 'settings' && (
                    <span className="text-[11px] text-slate-500 font-mono block -mt-0.5">
                      {userProfile.name} • {userProfile.email}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {item.badge && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-extrabold tracking-wider">
                    {item.badge}
                  </span>
                )}
                {item.count !== undefined && (
                  <span className="text-xs font-mono font-medium text-slate-500 tabular-nums">
                    {item.count}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
