/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AppView, TrialBalance, AppContact, VoiceAgent, CallLog, Campaign, PhoneNumberItem, UserSubscription, PlanTier } from './types';
import { INITIAL_AGENTS, INITIAL_CALL_LOGS, INITIAL_CAMPAIGNS, INITIAL_PHONE_NUMBERS } from './data/mockData';
import { unlockAudioAndSpeech, ringback, playConnectChime, playEndCallChime, setMasterAudioVolume } from './utils/audio';
import { webrtcManager, IncomingCallOffer, OnlinePeer } from './utils/webrtc';

// Components
import { HomeMenu } from './components/HomeMenu';
import { BottomNav } from './components/BottomNav';
import { ContactsView } from './components/ContactsView';
import { TrialDashboardView } from './components/TrialDashboardView';
import { AutoRetryView } from './components/AutoRetryView';
import { AutoSMSView } from './components/AutoSMSView';
import { IVRMenuView } from './components/IVRMenuView';
import { IncomingAudioView } from './components/IncomingAudioView';
import { InsertSimCardView } from './components/InsertSimCardView';
import { UpgradePlanView } from './components/UpgradePlanView';
import { ScheduleView } from './components/ScheduleView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { ConnectLiveCallView } from './components/ConnectLiveCallView';
import { CallLogs } from './components/CallLogs';
import { AgentStudio } from './components/AgentStudio';
import { Campaigns } from './components/Campaigns';
import { PermissionsView } from './components/PermissionsView';
import { PhoneNumbers } from './components/PhoneNumbers';
import { IncomingCallOverlay, ActiveIncomingCallState } from './components/IncomingCallOverlay';

// Header icons
import { PhoneCall, Smartphone, Maximize2, Minimize2, Video } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [isMobileFrame, setIsMobileFrame] = useState(true);

  const [trialBalance, setTrialBalance] = useState<TrialBalance>({
    minutesLeftSeconds: 999999,
    callsRemaining: 999999,
    totalCallsAllowed: 999999,
    daysLeft: 99999,
    planName: '100% Lifetime Owned'
  });

  const [subscription, setSubscription] = useState<UserSubscription>({
    currentPlanId: 'pro',
    billingCycle: 'monthly',
    renewsAt: 'Never (Lifetime Owned)',
    invoiceId: 'LIFETIME-LICENSE-SS',
    paymentMethod: {
      brand: 'Zero Software Bills',
      last4: 'FREE',
      expiry: 'Forever'
    }
  });

  // Registered caller ID / in-app phone number (used to receive real incoming WebRTC calls)
  const [myNumber, setMyNumber] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('applet_caller_id') || '';
      if (saved === '+1 (800) 555-LIVE') return '';
      return saved;
    } catch {
      return '';
    }
  });

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [onlinePeers, setOnlinePeers] = useState<OnlinePeer[]>([]);
  const [incomingOffer, setIncomingOffer] = useState<IncomingCallOffer | null>(null);
  const [activeIncomingCall, setActiveIncomingCall] = useState<ActiveIncomingCallState | null>(null);
  const [incomingCallError, setIncomingCallError] = useState<string | null>(null);

  const activeIncomingCallRef = useRef<ActiveIncomingCallState | null>(null);
  activeIncomingCallRef.current = activeIncomingCall;
  const incomingOfferRef = useRef<IncomingCallOffer | null>(null);
  incomingOfferRef.current = incomingOffer;

  // Contacts start empty until imported or added
  const [contacts, setContacts] = useState<AppContact[]>(() => {
    try {
      const saved = localStorage.getItem('applet_user_contacts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(c =>
            c && c.name &&
            !c.name.includes('Smith') &&
            !c.name.includes('Velocity') &&
            !c.name.includes('Scott') &&
            !c.name.includes('Halpert') &&
            !c.name.includes('Sourav Singh (Registered SIM)') &&
            !c.name.includes('Rajesh Kumar (Client Lead)') &&
            !c.name.includes('Priya Sharma') &&
            !c.phone?.includes('555-01') &&
            !c.phone?.includes('7291066713') &&
            !c.name?.toLowerCase().includes('ghgh')
          );
        }
      }
    } catch {}
    return [];
  });

  const [calls, setCalls] = useState<CallLog[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem('applet_user_contacts', JSON.stringify(contacts));
    } catch {}
  }, [contacts]);

  const [agents, setAgents] = useState<VoiceAgent[]>(INITIAL_AGENTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberItem[]>(INITIAL_PHONE_NUMBERS);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(INITIAL_AGENTS[0]?.id || 'agent-ava');
  const [dialingContact, setDialingContact] = useState<{ name: string; phone: string; autoDial?: boolean } | null>(null);
  const [activeInspectCall, setActiveInspectCall] = useState<CallLog | null>(null);
  const [autoStartLiveConnect, setAutoStartLiveConnect] = useState(false);
  const [liveConnectInitialTab, setLiveConnectInitialTab] = useState<'smart_dialer' | 'auto_calling' | 'contacts'>('smart_dialer');
  const [autoStartWalkthrough, setAutoStartWalkthrough] = useState(false);
  const [scheduleInitialTab, setScheduleInitialTab] = useState<'audio' | 'contacts' | 'schedule' | 'interval' | 'rules'>('schedule');

  // Connect global WebSocket signaling & handle incoming calls across every screen
  useEffect(() => {
    let profileName = 'Original Call User';
    try {
      const savedProfile = localStorage.getItem('applet_user_profile');
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        if (p?.name) profileName = p.name;
      }
    } catch {}

    webrtcManager.connectSignaling(myNumber, profileName);

    const unsubscribe = webrtcManager.subscribe({
      onSocketStatusChange: (connected) => {
        setWsConnected(connected);
      },
      onOnlinePeersChange: (peers) => {
        setOnlinePeers(peers);
      },
      onIncomingCall: (offer) => {
        unlockAudioAndSpeech();
        setIncomingCallError(null);
        setIncomingOffer(offer);
        try {
          ringback.start();
        } catch {}
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`Incoming Call from ${offer.callerName || offer.callerNumber}`, {
              body: `Tap RoboVoiceCall to Answer (${offer.callerNumber})`
            });
          } catch {}
        }
      },
      onAudioLevel: (level) => {
        setActiveIncomingCall((prev) => (prev ? { ...prev, micLevel: level } : prev));
      },
      onIceStateChange: (iceState) => {
        setActiveIncomingCall((prev) => (prev ? { ...prev, iceState } : prev));
      },
      onCallEnded: () => {
        ringback.stop();
        playEndCallChime();
        if (incomingOfferRef.current && !activeIncomingCallRef.current) {
          setIncomingOffer(null);
        }
        const endedCall = activeIncomingCallRef.current;
        if (endedCall) {
          const log: CallLog = {
            id: `call-in-${Date.now().toString(36)}`,
            callerName: endedCall.peerName,
            callerNumber: endedCall.peerNumber,
            agentId: 'original-webrtc-in',
            agentName: 'Original Voice (Inbound)',
            timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            direction: 'inbound',
            durationSeconds: Math.max(1, endedCall.durationSeconds),
            disposition: 'Completed',
            sentiment: 'positive',
            cost: 0,
            latencyMs: 25,
            summary: `Original two-way WebRTC call received from ${endedCall.peerName} (${endedCall.peerNumber}).`,
            keyEntities: {
              'Method': 'WebRTC Direct P2P (WebSocket Signaling)',
              'Direction': 'Inbound'
            },
            transcript: []
          };
          setCalls((prev) => [log, ...prev]);
          setActiveIncomingCall(null);
        }
      }
    });

    const handleFirstInteraction = () => {
      unlockAudioAndSpeech();
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true });

    return () => {
      unsubscribe();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  // Tick active inbound call timer
  useEffect(() => {
    if (!activeIncomingCall) return;
    const interval = window.setInterval(() => {
      setActiveIncomingCall((prev) => (prev ? { ...prev, durationSeconds: prev.durationSeconds + 1 } : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [Boolean(activeIncomingCall)]);

  const handleUpdateMyNumber = (newNum: string) => {
    const clean = newNum.trim();
    setMyNumber(clean);
    try {
      localStorage.setItem('applet_caller_id', clean);
    } catch {}
    let profileName = 'Original Call User';
    try {
      const savedProfile = localStorage.getItem('applet_user_profile');
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        if (p?.name) profileName = p.name;
      }
    } catch {}
    webrtcManager.registerNumber(clean, profileName);
  };

  const handleAnswerGlobalIncomingCall = async () => {
    const offer = incomingOfferRef.current;
    if (!offer) return;
    ringback.stop();
    setIncomingCallError(null);
    try {
      await webrtcManager.answerIncomingCall(offer);
      playConnectChime();
      setIncomingOffer(null);
      setActiveIncomingCall({
        callId: offer.callId,
        peerName: offer.callerName || 'Incoming Caller',
        peerNumber: offer.callerNumber,
        durationSeconds: 0,
        isMuted: false,
        speakerOn: true,
        micLevel: 0,
        iceState: webrtcManager.iceConnectionState || 'checking'
      });
    } catch (err: any) {
      setIncomingCallError(err?.message || 'Microphone permission is required to answer the call.');
    }
  };

  const handleDeclineGlobalIncomingCall = () => {
    ringback.stop();
    if (incomingOffer) {
      webrtcManager.rejectIncomingCall(incomingOffer);
    }
    setIncomingOffer(null);
    setIncomingCallError(null);
  };

  const handleEndGlobalIncomingCall = () => {
    const finished = activeIncomingCall;
    webrtcManager.terminateCallSession();
    playEndCallChime();
    if (finished) {
      const log: CallLog = {
        id: `call-in-${Date.now().toString(36)}`,
        callerName: finished.peerName,
        callerNumber: finished.peerNumber,
        agentId: 'original-webrtc-in',
        agentName: 'Original Voice (Inbound)',
        timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        direction: 'inbound',
        durationSeconds: Math.max(1, finished.durationSeconds),
        disposition: 'Completed',
        sentiment: 'positive',
        cost: 0,
        latencyMs: 25,
        summary: `Original two-way WebRTC call received from ${finished.peerName} (${finished.peerNumber}).`,
        keyEntities: {
          'Method': 'WebRTC Direct P2P (WebSocket Signaling)',
          'Direction': 'Inbound'
        },
        transcript: []
      };
      setCalls((prev) => [log, ...prev]);
    }
    setActiveIncomingCall(null);
  };

  const handleUpgradePlanSuccess = (newPlanId: PlanTier, newBalance: TrialBalance) => {
    setSubscription(prev => ({
      ...prev,
      currentPlanId: newPlanId,
      renewsAt: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      invoiceId: `INV-2026-${Math.floor(100000 + Math.random() * 900000)}`
    }));
    setTrialBalance(newBalance);
  };

  const handleCallFinished = (newCall: CallLog) => {
    setCalls(prev => [newCall, ...prev]);
    setDialingContact(null);
  };

  const handleCallContact = (contact: AppContact) => {
    setDialingContact({ name: contact.name, phone: contact.phone, autoDial: true });
    setLiveConnectInitialTab('smart_dialer');
    setAutoStartLiveConnect(true);
    setCurrentView('live_connect');
  };

  const handleAddContact = (newC: AppContact) => {
    setContacts(prev => [newC, ...prev]);
  };

  const handleSendContactsToScheduler = (selectedContacts: AppContact[]) => {
    try {
      const saved = localStorage.getItem('applet_pending_queue');
      const existing = saved ? JSON.parse(saved) : [];
      const existingPhones = new Set(existing.map((c: any) => c.phone.replace(/[^\d+]/g, '')));
      const toAdd = selectedContacts
        .filter(c => !existingPhones.has(c.phone.replace(/[^\d+]/g, '')))
        .map((c, i) => ({
          id: c.id || `app-cnt-${Date.now()}-${i}`,
          name: c.name || 'Contact',
          phone: c.phone,
          status: 'pending' as const
        }));
      const merged = [...toAdd, ...existing];
      localStorage.setItem('applet_pending_queue', JSON.stringify(merged));
    } catch {}
    setCurrentView('schedule');
  };

  return (
    <div className="min-h-screen bg-[#EBF0F7] text-slate-900 flex flex-col font-sans selection:bg-sky-500/20 selection:text-sky-900">
      {/* Global Incoming / Connected Call Screen (visible on any tab) */}
      <IncomingCallOverlay
        incomingOffer={incomingOffer}
        activeCall={activeIncomingCall}
        callError={incomingCallError}
        onDismissError={() => setIncomingCallError(null)}
        onAnswer={handleAnswerGlobalIncomingCall}
        onDecline={handleDeclineGlobalIncomingCall}
        onEndCall={handleEndGlobalIncomingCall}
        onToggleMute={() => {
          if (!activeIncomingCall) return;
          const nextMuted = !activeIncomingCall.isMuted;
          webrtcManager.setMicrophoneMute(nextMuted);
          setActiveIncomingCall((prev) => (prev ? { ...prev, isMuted: nextMuted } : null));
        }}
        onToggleSpeaker={() => {
          if (!activeIncomingCall) return;
          const nextSpeaker = !activeIncomingCall.speakerOn;
          setMasterAudioVolume(nextSpeaker ? 1.0 : 0.25);
          const audioEl = document.getElementById('globalRemoteAudio') as HTMLAudioElement | null;
          if (audioEl) audioEl.volume = nextSpeaker ? 1.0 : 0.25;
          setActiveIncomingCall((prev) => (prev ? { ...prev, speakerOn: nextSpeaker } : null));
        }}
      />

      {/* Top App Control Bar */}
      <header className="w-full bg-[#061A40] text-white border-b border-slate-800 px-4 py-2.5 shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-md">
              <PhoneCall className="w-4 h-4 fill-current" />
            </div>
            <span className="text-base font-bold tracking-tight text-white group-hover:text-emerald-400 transition">
              RoboVoiceCall
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileFrame(!isMobileFrame)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition font-medium"
              title={isMobileFrame ? 'Expand to Wide Desktop View' : 'Switch to Mobile Screen Frame'}
            >
              {isMobileFrame ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Wide View</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mobile Frame</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setAutoStartWalkthrough(true);
                setScheduleInitialTab('rules');
                setCurrentView('schedule');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-md transition active:scale-95 cursor-pointer"
              title="Record Video of Calling Campaign"
            >
              <Video className="w-3.5 h-3.5 fill-current" />
              <span>Record Video</span>
            </button>

            <button
              onClick={() => {
                try {
                  localStorage.setItem('applet_calling_engine', 'webrtc');
                } catch {}
                setDialingContact(null);
                setLiveConnectInitialTab('smart_dialer');
                setAutoStartLiveConnect(false);
                setCurrentView('live_connect');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer"
              title="Launch Original In-App Voice Dialer"
            >
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-white animate-pulse' : 'bg-amber-300'}`} />
              <span>Call Connect</span>
            </button>

            <button
              onClick={() => {
                setDialingContact(null);
                setLiveConnectInitialTab('smart_dialer');
                setAutoStartLiveConnect(false);
                setCurrentView('live_connect');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs shadow-sm transition active:scale-95"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Keypad</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full flex justify-center items-start p-2 sm:p-4 md:p-6">
        <div
          className={`w-full transition-all duration-200 ${
            isMobileFrame
              ? 'max-w-[440px] bg-slate-100 border border-slate-300/80 rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[780px]'
              : 'max-w-5xl bg-slate-100 border border-slate-300/80 rounded-2xl shadow-xl p-4 flex flex-col'
          }`}
        >
          <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
            {currentView === 'home' && (
              <HomeMenu
                trialBalance={trialBalance}
                callHistoryCount={calls.length}
                contactsCount={contacts.length}
                myNumber={myNumber}
                wsConnected={wsConnected}
                onlinePeersCount={onlinePeers.length}
                onUpdateMyNumber={handleUpdateMyNumber}
                onRecordVideoWalkthrough={() => {
                  setAutoStartWalkthrough(true);
                  setScheduleInitialTab('rules');
                  setCurrentView('schedule');
                }}
                onNavigate={(v, tab, autoDialNow) => {
                  if (tab) {
                    setScheduleInitialTab(tab);
                  } else if (v === 'schedule') {
                    setScheduleInitialTab('schedule');
                  }
                  if (v === 'call') {
                    setDialingContact(null);
                    setLiveConnectInitialTab('auto_calling');
                    setAutoStartLiveConnect(Boolean(autoDialNow));
                  } else if (v === 'live_connect') {
                    setDialingContact(null);
                    setLiveConnectInitialTab('smart_dialer');
                    setAutoStartLiveConnect(false);
                  } else {
                    setDialingContact(null);
                    setAutoStartLiveConnect(false);
                  }
                  setCurrentView(v);
                }}
              />
            )}

            {(currentView === 'live_connect' || currentView === 'call') && (
              <ConnectLiveCallView
                agents={agents}
                selectedAgentId={selectedAgentId}
                onSelectAgent={setSelectedAgentId}
                trialBalance={trialBalance}
                contacts={contacts}
                onlinePeers={onlinePeers}
                wsConnected={wsConnected}
                myNumber={myNumber}
                initialContact={dialingContact}
                initialTab={liveConnectInitialTab}
                onCallFinished={(c) => {
                  setAutoStartLiveConnect(false);
                  handleCallFinished(c);
                }}
                onBack={() => {
                  setAutoStartLiveConnect(false);
                  setCurrentView('home');
                }}
                onNavigateHistory={() => {
                  setAutoStartLiveConnect(false);
                  setCurrentView('history');
                }}
                onNavigateSchedule={() => {
                  setAutoStartLiveConnect(false);
                  setCurrentView('schedule');
                }}
                onNavigatePermissions={() => {
                  setAutoStartLiveConnect(false);
                  setCurrentView('permissions');
                }}
                autoStart={autoStartLiveConnect}
              />
            )}

            {currentView === 'dashboard' && (
              <TrialDashboardView
                trialBalance={trialBalance}
                calls={calls}
                onViewCallDetail={(call) => {
                  setActiveInspectCall(call);
                  setCurrentView('history');
                }}
                onNavigateCall={() => setCurrentView('live_connect')}
                onNavigateUpgrade={() => setCurrentView('upgrade')}
                onBack={() => setCurrentView('home')}
              />
            )}

            {currentView === 'history' && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setCurrentView('home')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 w-fit mb-1"
                >
                  ← Back to Home
                </button>
                <CallLogs
                  calls={calls}
                  agents={agents}
                  activeInspectCall={activeInspectCall}
                  onSelectCall={setActiveInspectCall}
                  onNavigateCall={() => setCurrentView('live_connect')}
                />
              </div>
            )}

            {currentView === 'contacts' && (
              <ContactsView
                contacts={contacts}
                onCallContact={handleCallContact}
                onAddContact={handleAddContact}
                onImportContacts={(newC) => setContacts(prev => [...newC, ...prev])}
                onDeleteContact={(id) => {
                  const target = contacts.find(c => c.id === id);
                  const cleanPhone = target?.phone ? target.phone.replace(/[^\d]/g, '') : '';
                  if (cleanPhone) {
                    try {
                      const savedRemoved = localStorage.getItem('applet_removed_phonebook_phones');
                      const removedArr = savedRemoved ? JSON.parse(savedRemoved) : [];
                      localStorage.setItem('applet_removed_phonebook_phones', JSON.stringify([...new Set([...removedArr, cleanPhone])]));

                      const savedPb = localStorage.getItem('applet_sim_phonebook_list');
                      if (savedPb) {
                        const pbArr = JSON.parse(savedPb);
                        const filteredPb = pbArr.filter((c: any) => c.phone.replace(/[^\d]/g, '') !== cleanPhone && c.id !== id);
                        localStorage.setItem('applet_sim_phonebook_list', JSON.stringify(filteredPb));
                      }
                    } catch {}
                  }
                  setContacts(prev => prev.filter(c => c.id !== id));
                }}
                onClearContacts={() => {
                  try {
                    const phones = contacts.map(c => c.phone.replace(/[^\d]/g, '')).filter(Boolean);
                    const savedRemoved = localStorage.getItem('applet_removed_phonebook_phones');
                    const removedArr = savedRemoved ? JSON.parse(savedRemoved) : [];
                    localStorage.setItem('applet_removed_phonebook_phones', JSON.stringify([...new Set([...removedArr, ...phones])]));
                    localStorage.setItem('applet_sim_phonebook_list', JSON.stringify([]));
                  } catch {}
                  setContacts([]);
                }}
                onSendToScheduler={handleSendContactsToScheduler}
                onBack={() => setCurrentView('home')}
              />
            )}

            {currentView === 'voice' && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setCurrentView('home')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 w-fit mb-1"
                >
                  ← Back to Home
                </button>
                <AgentStudio
                  agents={agents}
                  onUpdateAgents={setAgents}
                  onSelectAgentForCall={(agentId) => {
                    setSelectedAgentId(agentId);
                    setCurrentView('live_connect');
                  }}
                />
              </div>
            )}

            {currentView === 'campaigns' && (
              <div className="flex flex-col gap-3">
                <Campaigns
                  campaigns={campaigns}
                  agents={agents}
                  onUpdateCampaigns={setCampaigns}
                  onLaunchLiveDialer={(contact, agentId) => {
                    setSelectedAgentId(agentId);
                    setDialingContact({ name: contact.name, phone: contact.phoneNumber, autoDial: false });
                    setCurrentView('live_connect');
                  }}
                  onBack={() => setCurrentView('home')}
                  onOpenScheduler={() => {
                    setScheduleInitialTab('schedule');
                    setCurrentView('schedule');
                  }}
                />
              </div>
            )}

            {currentView === 'schedule' && (
              <ScheduleView
                agents={agents}
                contacts={contacts}
                initialTab={scheduleInitialTab}
                autoStartWalkthrough={autoStartWalkthrough}
                onLogCompletedCall={(completedCall) => {
                  setCalls(prev => [completedCall, ...prev]);
                }}
                onCallScheduled={(contact, agentId) => {
                  if (agentId) setSelectedAgentId(agentId);
                  setDialingContact({ ...contact, autoDial: true });
                  setLiveConnectInitialTab('smart_dialer');
                  setAutoStartLiveConnect(true);
                  setCurrentView('live_connect');
                }}
                onImportNewContacts={(newC) => {
                  setContacts(prev => [...newC, ...prev]);
                }}
                onBack={() => {
                  setAutoStartWalkthrough(false);
                  setCurrentView('home');
                }}
              />
            )}

            {currentView === 'retry' && <AutoRetryView onBack={() => setCurrentView('home')} />}
            {currentView === 'sms' && <AutoSMSView onBack={() => setCurrentView('home')} />}
            {currentView === 'reports' && <ReportsView calls={calls} onBack={() => setCurrentView('home')} />}
            {currentView === 'ivr' && <IVRMenuView onBack={() => setCurrentView('home')} />}
            {currentView === 'audio' && <IncomingAudioView onBack={() => setCurrentView('home')} />}

            {currentView === 'sim' && (
              <InsertSimCardView
                onBack={() => setCurrentView('home')}
                onNavigateTelephony={() => setCurrentView('telephony')}
              />
            )}

            {currentView === 'upgrade' && (
              <UpgradePlanView
                trialBalance={trialBalance}
                subscription={subscription}
                onUpgradeSuccess={handleUpgradePlanSuccess}
                onBack={() => setCurrentView('home')}
              />
            )}

            {currentView === 'settings' && (
              <SettingsView
                onBack={() => setCurrentView('home')}
                onNavigatePermissions={() => setCurrentView('permissions')}
              />
            )}

            {currentView === 'permissions' && (
              <div className="flex flex-col gap-3">
                <PermissionsView
                  onBack={() => setCurrentView('home')}
                  onComplete={() => setCurrentView('live_connect')}
                />
              </div>
            )}

            {currentView === 'telephony' && (
              <div className="flex flex-col gap-3">
                <PhoneNumbers
                  phoneNumbers={phoneNumbers}
                  agents={agents}
                  onUpdatePhoneNumbers={setPhoneNumbers}
                  onSelectNumberForCall={(num, agentId) => {
                    setSelectedAgentId(agentId);
                    setDialingContact({ name: 'Inbound Line Tester', phone: num, autoDial: false });
                    setCurrentView('live_connect');
                  }}
                  onBack={() => setCurrentView('home')}
                />
              </div>
            )}
          </div>

          <BottomNav
            currentView={currentView}
            onNavigate={(v) => {
              if (v === 'call' || v === 'live_connect') {
                setDialingContact(null);
                setLiveConnectInitialTab(v === 'call' ? 'auto_calling' : 'smart_dialer');
                setAutoStartLiveConnect(false);
              }
              setCurrentView(v);
            }}
          />
        </div>
      </main>
    </div>
  );
}
