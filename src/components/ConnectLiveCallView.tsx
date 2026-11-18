import React, { useState, useEffect, useRef } from 'react';
import { VoiceAgent, TrialBalance, CallLog, TranscriptMessage, Sentiment, AppContact } from '../types';
import { 
  playDtmfTone, ringback, playConnectChime, playEndCallChime, 
  holdMusic, unlockAudioAndSpeech, setMasterAudioVolume, getAudioContext 
} from '../utils/audio';
import { speechEngine } from '../utils/speech';
import { 
  Phone, PhoneOff, PhoneCall, Mic, MicOff, Volume2, VolumeX, Pause, Play, 
  Send, ShieldCheck, Zap, Radio, Globe, UserCheck, Clock, Sparkles, 
  ArrowLeft, CheckCircle2, RefreshCw, Grid as KeypadIcon, MessageSquare, 
  ChevronDown, PhoneIncoming, AlertCircle, PhoneForwarded, Smartphone, Users,
  Delete, Search, FileText, Disc, MapPin, Building, Shield, X,
  Calendar, ArrowUpRight, Bell, Trash2, Activity, Server, AlertTriangle
} from 'lucide-react';
import { webrtcManager, OnlinePeer } from '../utils/webrtc';
import { WebRTCDiagnosticsModal } from './WebRTCDiagnosticsModal';
import { agoraVoiceManager } from '../utils/agora';
import { AgoraSettingsModal } from './AgoraSettingsModal';
import { vonageVoiceManager } from '../utils/vonage';
import { VonageSettingsModal } from './VonageSettingsModal';
import { PermissionsView } from './PermissionsView';

export interface ScheduledCallItem {
  id: string;
  name: string;
  phone: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  sim?: string;
  agentId: string;
  callReason: string;
  status: 'pending' | 'completed' | 'cancelled';
  autoDialOnTrigger: boolean;
  createdAt: string;
}

interface ConnectLiveCallViewProps {
  agents: VoiceAgent[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  trialBalance: TrialBalance;
  onCallFinished: (callData: CallLog) => void;
  onBack: () => void;
  onNavigateHistory: () => void;
  onNavigateSchedule?: () => void;
  autoStart?: boolean;
  initialTab?: 'smart_dialer' | 'auto_calling' | 'contacts';
  contacts?: AppContact[];
  onlinePeers?: OnlinePeer[];
  wsConnected?: boolean;
  myNumber?: string;
  initialContact?: { name: string; phone: string } | null;
  onNavigatePermissions?: () => void;
}

const DIALPAD_KEYS = [
  { num: '1', sub: '⚬' },
  { num: '2', sub: 'ABC' },
  { num: '3', sub: 'DEF' },
  { num: '4', sub: 'GHI' },
  { num: '5', sub: 'JKL' },
  { num: '6', sub: 'MNO' },
  { num: '7', sub: 'PQRS' },
  { num: '8', sub: 'TUV' },
  { num: '9', sub: 'WXYZ' },
  { num: '*', sub: '✻' },
  { num: '0', sub: '+' },
  { num: '#', sub: '♯' }
];

const getCallerIdMeta = (phone: string, name: string) => {
  const clean = phone.replace(/[^\d+]/g, '');
  if (!clean) {
    return { operator: 'Keypad Ready', location: 'Enter number to dial', isBusiness: false };
  }
  let operator = 'Airtel VoLTE';
  let location = 'India (Verified)';
  let isBusiness = false;

  if (clean.startsWith('+1') || (clean.length === 10 && !['9', '8', '7', '6'].includes(clean[0]))) {
    operator = 'Verizon / AT&T';
    location = 'United States';
  } else if (clean.startsWith('+44')) {
    operator = 'EE / Vodafone';
    location = 'United Kingdom';
  } else if (clean.startsWith('+91') || clean.length === 10) {
    if (clean.includes('98') || clean.includes('99') || clean.includes('97')) {
      operator = 'Airtel 5G Plus';
      location = 'Delhi NCR / Mumbai';
    } else if (clean.includes('70') || clean.includes('79') || clean.includes('80') || clean.includes('88') || clean.includes('91')) {
      operator = 'Jio True 5G';
      location = 'Maharashtra / Bangalore';
    } else {
      operator = 'Vodafone Idea (Vi)';
      location = 'India';
    }
  }

  if (
    name.toLowerCase().includes('consult') || 
    name.toLowerCase().includes('demo') || 
    name.toLowerCase().includes('corp') || 
    name.toLowerCase().includes('ltd') || 
    name.toLowerCase().includes('care') || 
    name.toLowerCase().includes('support') ||
    name.toLowerCase().includes('service')
  ) {
    isBusiness = true;
  }

  return { operator, location, isBusiness };
};

// Generates the 16-lobed scalloped rosette flower path for the in-app caller avatar
const getScallopedRosettePath = (cx = 90, cy = 90, rBase = 72, rAmp = 7, lobes = 16) => {
  let d = '';
  const totalSteps = lobes * 8;
  for (let i = 0; i <= totalSteps; i++) {
    const theta = (i / totalSteps) * Math.PI * 2;
    const r = rBase + rAmp * Math.sin(lobes * theta);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d + 'Z';
};

export const ConnectLiveCallView: React.FC<ConnectLiveCallViewProps> = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  trialBalance,
  onCallFinished,
  onBack,
  onNavigateHistory,
  onNavigateSchedule,
  autoStart,
  initialTab,
  contacts = [],
  onlinePeers = [],
  wsConnected = false,
  myNumber = '',
  initialContact,
  onNavigatePermissions
}) => {
  const currentAgent = agents.find(a => a.id === selectedAgentId) || agents[0];

  // Call configuration state
  const [connectMode, setConnectMode] = useState<'outbound' | 'web'>('outbound');
  const [targetNumber, setTargetNumber] = useState<string>(() => initialContact?.phone || '');
  const [targetName, setTargetName] = useState<string>(() => initialContact?.name || '');
  const [callScenario, setCallScenario] = useState('Direct 2-Way Voice Call');
  const [callReason, setCallReason] = useState<string>('⚡ Urgent Call');
  const [isRecording, setIsRecording] = useState<boolean>(true);
  const [flashSent, setFlashSent] = useState<boolean>(false);
  const [dialerTab, setDialerTab] = useState<'smart_dialer' | 'auto_calling' | 'contacts'>(initialTab || 'smart_dialer');
  const [showCallNotes, setShowCallNotes] = useState<boolean>(false);
  const [callNotes, setCallNotes] = useState<string>('');
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);

  // Automatic Numbers Multi-Dialing Queue State
  const [autoCallQueue, setAutoCallQueue] = useState<{
    id: string;
    name: string;
    phone: string;
    status: 'pending' | 'dialing' | 'connected' | 'completed' | 'skipped';
  }[]>(() => {
    try {
      const saved = localStorage.getItem('applet_auto_call_queue');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .filter((item: any) => item && item.phone && !item.name?.includes('(Lead 1)') && !item.name?.includes('(Lead 2)') && !item.name?.includes('(Lead 3)'))
            .map((item: any, i: number) => ({
              id: item.id || `q-${i}`,
              name: item.name || `Number ${i + 1}`,
              phone: item.phone,
              status: 'pending' as const
            }));
        }
      }
    } catch {}
    if (contacts && contacts.length > 0) {
      return contacts.slice(0, 10).map((c, i) => ({
        id: c.id || `c-${i}`,
        name: c.name || `Contact ${i + 1}`,
        phone: c.phone,
        status: 'pending' as const
      }));
    }
    return [];
  });
  const [isAutoCallingActive, setIsAutoCallingActive] = useState<boolean>(false);
  const [autoCallIndex, setAutoCallIndex] = useState<number>(0);
  const [autoCallIntervalSeconds, setAutoCallIntervalSeconds] = useState<number>(5);
  const [autoCallDurationLimit, setAutoCallDurationLimit] = useState<number>(0);
  const [autoCallCountdown, setAutoCallCountdown] = useState<number | null>(null);
  const [newQueueName, setNewQueueName] = useState<string>('');
  const [newQueuePhone, setNewQueuePhone] = useState<string>('');
  const autoCallQueueRef = useRef(autoCallQueue);
  const isAutoCallingActiveRef = useRef(isAutoCallingActive);
  const autoCallIndexRef = useRef(autoCallIndex);
  const autoCallIntervalSecondsRef = useRef(autoCallIntervalSeconds);
  const autoCallDurationLimitRef = useRef(autoCallDurationLimit);
  const targetNameRef = useRef(targetName);
  const targetNumberRef = useRef(targetNumber);
  const sessionStateRef = useRef<'idle' | 'dialing' | 'ringing' | 'inbound_ringing' | 'connected' | 'hold' | 'ended'>('idle');
  const digitDialIntervalRef = useRef<number | null>(null);
  const connectDelayTimerRef = useRef<number | null>(null);
  const autoCallCooldownTimerRef = useRef<number | null>(null);
  const hasAutoStartedRef = useRef<boolean>(false);
  const isAutoDialingSequenceRef = useRef<boolean>(false);
  const executeAutoCallItemRef = useRef<(index: number) => void>(() => {});
  const handleEndCallRef = useRef<() => void>(() => {});

  useEffect(() => {
    autoCallQueueRef.current = autoCallQueue;
    try {
      localStorage.setItem('applet_auto_call_queue', JSON.stringify(autoCallQueue));
    } catch {}
  }, [autoCallQueue]);
  useEffect(() => {
    isAutoCallingActiveRef.current = isAutoCallingActive;
  }, [isAutoCallingActive]);
  useEffect(() => {
    autoCallIndexRef.current = autoCallIndex;
  }, [autoCallIndex]);
  useEffect(() => {
    autoCallIntervalSecondsRef.current = autoCallIntervalSeconds;
  }, [autoCallIntervalSeconds]);
  useEffect(() => {
    autoCallDurationLimitRef.current = autoCallDurationLimit;
  }, [autoCallDurationLimit]);
  useEffect(() => {
    targetNameRef.current = targetName;
  }, [targetName]);
  useEffect(() => {
    targetNumberRef.current = targetNumber;
  }, [targetNumber]);
  useEffect(() => {
    if (initialTab && !isAutoCallingActiveRef.current) {
      setDialerTab(initialTab);
    }
  }, [initialTab]);

  // Scheduled Number Dialing State
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [showScheduledListDrawer, setShowScheduledListDrawer] = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [scheduleTime, setScheduleTime] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 10);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  });
  const [scheduleAutoDial, setScheduleAutoDial] = useState<boolean>(false);
  const [scheduleAgentId, setScheduleAgentId] = useState<string>(selectedAgentId || agents[0]?.id || 'agent-1');
  const [scheduleToast, setScheduleToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCallItem[]>(() => {
    try {
      const saved = localStorage.getItem('applet_scheduled_calls');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Permanently ensure no scheduled call auto-dials without user clicking Call
          return parsed.map((item: any) => ({ ...item, autoDialOnTrigger: false }));
        }
      }
    } catch {}
    return [];
  });

  // Persist scheduled calls
  useEffect(() => {
    try {
      localStorage.setItem('applet_scheduled_calls', JSON.stringify(scheduledCalls));
    } catch {}
  }, [scheduledCalls]);

  // WebRTC Diagnostics and Microphone Permission State
  const [showWebRTCDiagnostics, setShowWebRTCDiagnostics] = useState<boolean>(false);
  const [micPermissionState, setMicPermissionState] = useState<'granted' | 'prompt' | 'denied' | 'unknown'>('unknown');

  // Calling Engine Selection (Direct WebRTC vs Vonage vs Agora)
  const [callingEngine, setCallingEngine] = useState<'webrtc' | 'vonage' | 'agora'>(() => {
    try {
      const saved = localStorage.getItem('applet_calling_engine');
      if (saved === 'vonage' || saved === 'agora' || saved === 'webrtc') return saved;
    } catch {}
    return 'webrtc'; // Default to Direct WebRTC VoIP
  });
  const [showAgoraSettings, setShowAgoraSettings] = useState<boolean>(false);
  const [showVonageSettings, setShowVonageSettings] = useState<boolean>(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState<boolean>(false);
  const [isPermissionsGranted, setIsPermissionsGranted] = useState<boolean>(true);
  const [selectedSimTrunk, setSelectedSimTrunk] = useState<'in_app' | 'sim1' | 'sim2' | 'webrtc'>('in_app');
  const [callNotice, setCallNotice] = useState<{ type: string; message: string } | null>(null);
  const [autoDialMode, setAutoDialMode] = useState<boolean>(true);
  const [activeDialingDigit, setActiveDialingDigit] = useState<string | null>(null);
  const [isAutoDialingSequence, setIsAutoDialingSequence] = useState<boolean>(false);
  const autoDialDebounceRef = useRef<number | null>(null);
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimationRef = useRef<number | null>(null);
  const ringingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const [iceStatusLabel, setIceStatusLabel] = useState<string>('idle');
  const [copiedPhoneToast, setCopiedPhoneToast] = useState<string | null>(null);

  const advanceAutoCallQueue = (markStatus: 'completed' | 'skipped', reasonNote?: string) => {
    if (!isAutoCallingActiveRef.current) return;
    const idx = autoCallIndexRef.current;
    const updatedQueue = autoCallQueueRef.current.map((item, i) =>
      i === idx ? { ...item, status: markStatus } : item
    );
    autoCallQueueRef.current = updatedQueue;
    setAutoCallQueue(updatedQueue);

    const nextIdx = idx + 1;
    if (nextIdx < updatedQueue.length) {
      if (autoCallCooldownTimerRef.current) {
        clearInterval(autoCallCooldownTimerRef.current);
      }
      let cd = Math.max(1, autoCallIntervalSecondsRef.current);
      setAutoCallCountdown(cd);
      if (reasonNote) {
        setCopiedPhoneToast(`${reasonNote} Moving to next number in ${cd}s...`);
      }
      autoCallCooldownTimerRef.current = window.setInterval(() => {
        if (!isAutoCallingActiveRef.current) {
          if (autoCallCooldownTimerRef.current) {
            clearInterval(autoCallCooldownTimerRef.current);
            autoCallCooldownTimerRef.current = null;
          }
          return;
        }
        cd -= 1;
        if (cd <= 0) {
          if (autoCallCooldownTimerRef.current) {
            clearInterval(autoCallCooldownTimerRef.current);
            autoCallCooldownTimerRef.current = null;
          }
          setAutoCallCountdown(null);
          setSessionState('idle');
          executeAutoCallItemRef.current(nextIdx);
        } else {
          setAutoCallCountdown(cd);
        }
      }, 1000);
    } else {
      isAutoCallingActiveRef.current = false;
      setIsAutoCallingActive(false);
      setAutoCallCountdown(null);
      setCopiedPhoneToast('✓ Auto-calling queue finished.');
      setTimeout(() => setCopiedPhoneToast(null), 4000);
    }
  };

  // Start Genuine In-App Voice Call (WebRTC P2P over WebSocket, Agora RTC, or configured PSTN)
  const startOriginalVoiceCall = async (
    numberToDial?: string,
    targetClientId?: string,
    peerNameOverride?: string
  ) => {
    const cleanNumber = (numberToDial || targetNumberRef.current || '').trim();
    const contactName = (peerNameOverride || targetNameRef.current || cleanNumber || 'Direct Contact').trim();

    if (!cleanNumber) {
      setCallNotice({ type: 'error', message: 'Please enter a phone number or select an online peer before dialing.' });
      setCopiedPhoneToast('Enter a phone number to place a call.');
      setTimeout(() => setCopiedPhoneToast(null), 3000);
      return;
    }

    if (autoDialDebounceRef.current) {
      clearTimeout(autoDialDebounceRef.current);
      autoDialDebounceRef.current = null;
    }
    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }

    setCallNotice(null);
    targetNumberRef.current = cleanNumber;
    targetNameRef.current = contactName;
    setTargetNumber(cleanNumber);
    setTargetName(contactName);

    unlockAudioAndSpeech();
    ringback.stop();
    holdMusic.stop();
    speechEngine.stopSpeaking();
    speechEngine.stopListening();
    setCallDuration(0);
    setIsOnHold(false);
    setIsMuted(false);
    setIsMicListening(false);
    setIsAgentSpeaking(false);
    setTranscript([
      {
        id: `msg-${Date.now()}`,
        sender: 'system',
        text: `Dialing ${contactName} (${cleanNumber}) via ${callingEngine === 'agora' ? 'Agora RTC' : callingEngine === 'vonage' ? 'PSTN / SIP API' : 'WebRTC Direct P2P'}...`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    ]);

    if (callingEngine === 'agora') {
      setSessionState('dialing');
      try {
        const channelClean = `call-${cleanNumber.replace(/[^\d]/g, '') || 'live'}`;
        await agoraVoiceManager.joinVoiceChannel({ channel: channelClean });
        playConnectChime();
        setSessionState('connected');
        setIsMicListening(true);
        setCopiedPhoneToast('🟢 Agora Voice Channel Connected (2-Way Mic Live)');
        setTimeout(() => setCopiedPhoneToast(null), 3500);
      } catch (err: any) {
        setSessionState('idle');
        const msg = err?.message || 'Agora microphone or channel connection failed.';
        setCallNotice({ type: 'error', message: msg });
        advanceAutoCallQueue('skipped', msg);
      }
      return;
    }

    if (callingEngine === 'vonage') {
      setSessionState('dialing');
      try {
        await vonageVoiceManager.initiateCall({
          targetNumber: cleanNumber,
          targetName: contactName
        });
        playConnectChime();
        setSessionState('connected');
        setCopiedPhoneToast('🟢 Outbound Carrier Call Initiated');
        setTimeout(() => setCopiedPhoneToast(null), 3500);
      } catch (err: any) {
        setSessionState('idle');
        const msg = err?.message || 'Carrier PSTN credentials are not configured on server.';
        setCallNotice({ type: 'error', message: msg });
        advanceAutoCallQueue('skipped', msg);
      }
      return;
    }

    // Default: Genuine WebRTC Peer-to-Peer via /ws/signaling
    setSessionState('dialing');
    try {
      await webrtcManager.startOutgoingCall({
        peerNumber: cleanNumber,
        peerName: contactName,
        targetClientId,
        callerNumber: myNumber || undefined
      });
    } catch (err: any) {
      ringback.stop();
      setSessionState('idle');
      const msg = err?.message || 'Unable to start WebRTC call.';
      setCallNotice({ type: 'error', message: msg });
      advanceAutoCallQueue('skipped', msg);
    }
  };

  const handleConnectInAppCall = (numberToDial?: string) => {
    void startOriginalVoiceCall(numberToDial);
  };

  // Start Automatic Numbers Calling Loop
  const handleStartAutoCallingLoop = (startIndex = 0) => {
    let queue = autoCallQueueRef.current;
    if (queue.length === 0 && contacts && contacts.length > 0) {
      queue = contacts.map((c, i) => ({
        id: c.id || `c-${i}`,
        name: c.name || `Contact ${i + 1}`,
        phone: c.phone,
        status: 'pending' as const
      }));
    }
    if (queue.length === 0) {
      setCopiedPhoneToast('Queue is empty. Please add phone numbers.');
      setTimeout(() => setCopiedPhoneToast(null), 3000);
      return;
    }

    if (autoCallCooldownTimerRef.current) {
      clearInterval(autoCallCooldownTimerRef.current);
      autoCallCooldownTimerRef.current = null;
    }
    if (digitDialIntervalRef.current) {
      clearInterval(digitDialIntervalRef.current);
      digitDialIntervalRef.current = null;
    }
    if (connectDelayTimerRef.current) {
      clearTimeout(connectDelayTimerRef.current);
      connectDelayTimerRef.current = null;
    }
    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }

    // Reset statuses synchronously on ref & state
    const resetQueue = queue.map((item, i) => (i >= startIndex ? { ...item, status: 'pending' as const } : item));
    autoCallQueueRef.current = resetQueue;
    setAutoCallQueue(resetQueue);

    isAutoCallingActiveRef.current = true;
    autoCallIndexRef.current = startIndex;
    setIsAutoCallingActive(true);
    setAutoCallCountdown(null);
    setAutoCallIndex(startIndex);

    setCopiedPhoneToast(`⚡ Automatic Numbers Calling: Dialing ${startIndex + 1} of ${resetQueue.length}...`);
    setTimeout(() => setCopiedPhoneToast(null), 3500);

    executeAutoCallItem(startIndex);
  };

  // Automatic Number Dialing with Animated Keypad Touches and DTMF Audio
  const handlePerformAutomaticNumberDialing = (numberToDial?: string) => {
    let rawNumber = (numberToDial || targetNumberRef.current || '').trim();
    if (!rawNumber) {
      if (contacts && contacts.length > 0 && contacts[0]?.phone) {
        rawNumber = contacts[0].phone;
        targetNameRef.current = contacts[0].name;
        setTargetName(contacts[0].name);
      } else {
        setCallNotice({ type: 'error', message: 'Please enter a phone number or select a contact/online peer first.' });
        return;
      }
    }

    const digitsOnly = rawNumber.replace(/[^\d+*#]/g, '');
    if (!digitsOnly) return;

    if (autoDialDebounceRef.current) {
      clearTimeout(autoDialDebounceRef.current);
      autoDialDebounceRef.current = null;
    }
    if (digitDialIntervalRef.current) {
      clearInterval(digitDialIntervalRef.current);
      digitDialIntervalRef.current = null;
    }
    if (connectDelayTimerRef.current) {
      clearTimeout(connectDelayTimerRef.current);
      connectDelayTimerRef.current = null;
    }

    unlockAudioAndSpeech();
    isAutoDialingSequenceRef.current = true;
    setIsAutoDialingSequence(true);
    targetNumberRef.current = '';
    setTargetNumber('');
    setCopiedPhoneToast(`⚡ Automatic Dialing: Dialing digits in phone...`);

    let currentIndex = 0;
    digitDialIntervalRef.current = window.setInterval(() => {
      if (currentIndex >= digitsOnly.length) {
        if (digitDialIntervalRef.current) {
          clearInterval(digitDialIntervalRef.current);
          digitDialIntervalRef.current = null;
        }
        setActiveDialingDigit(null);
        isAutoDialingSequenceRef.current = false;
        setIsAutoDialingSequence(false);
        setCopiedPhoneToast(`📱 Number Dialed • Connecting In-App Voice Call...`);
        connectDelayTimerRef.current = window.setTimeout(() => {
          connectDelayTimerRef.current = null;
          handleConnectInAppCall(digitsOnly);
        }, 300);
        return;
      }

      const digit = digitsOnly[currentIndex];
      setActiveDialingDigit(digit);
      try {
        playDtmfTone(digit);
      } catch {}

      targetNumberRef.current = targetNumberRef.current + digit;
      setTargetNumber(targetNumberRef.current);
      currentIndex += 1;

      setTimeout(() => {
        setActiveDialingDigit(null);
      }, 100);
    }, 140);
  };

  const executeAutoCallItem = (index: number) => {
    if (!isAutoCallingActiveRef.current) return;
    const queue = autoCallQueueRef.current;
    if (index >= queue.length) {
      isAutoCallingActiveRef.current = false;
      setIsAutoCallingActive(false);
      setAutoCallCountdown(null);
      setSessionState('idle');
      setCopiedPhoneToast('✓ Automatic Calling Completed for all phone numbers!');
      setTimeout(() => setCopiedPhoneToast(null), 4000);
      return;
    }

    const currentItem = queue[index];
    autoCallIndexRef.current = index;
    setAutoCallIndex(index);

    const updatedQueue = queue.map((item, i) => (i === index ? { ...item, status: 'dialing' as const } : item));
    autoCallQueueRef.current = updatedQueue;
    setAutoCallQueue(updatedQueue);

    targetNameRef.current = currentItem.name;
    setTargetName(currentItem.name);

    // Automatically dial number inside app with animated digits!
    handlePerformAutomaticNumberDialing(currentItem.phone);
  };
  executeAutoCallItemRef.current = executeAutoCallItem;

  const handleStopAutoCallingLoop = () => {
    isAutoCallingActiveRef.current = false;
    isAutoDialingSequenceRef.current = false;
    if (autoCallCooldownTimerRef.current) {
      clearInterval(autoCallCooldownTimerRef.current);
      autoCallCooldownTimerRef.current = null;
    }
    if (digitDialIntervalRef.current) {
      clearInterval(digitDialIntervalRef.current);
      digitDialIntervalRef.current = null;
    }
    if (connectDelayTimerRef.current) {
      clearTimeout(connectDelayTimerRef.current);
      connectDelayTimerRef.current = null;
    }
    setIsAutoCallingActive(false);
    setIsAutoDialingSequence(false);
    setAutoCallCountdown(null);
    if (sessionStateRef.current !== 'idle' && sessionStateRef.current !== 'ended') {
      handleEndCall();
    } else {
      setSessionState('idle');
    }
    setCopiedPhoneToast('⏹ Automatic calling stopped.');
    setTimeout(() => setCopiedPhoneToast(null), 2500);
  };

  const handleSkipToNextAutoCall = () => {
    if (autoCallCooldownTimerRef.current) {
      clearInterval(autoCallCooldownTimerRef.current);
      autoCallCooldownTimerRef.current = null;
      setAutoCallCountdown(null);
      const nextIdx = autoCallIndexRef.current + 1;
      setSessionState('idle');
      executeAutoCallItemRef.current(nextIdx);
      return;
    }
    handleEndCall();
  };

  const handleAddNumberToQueue = () => {
    if (!newQueuePhone.trim()) {
      setCopiedPhoneToast('Please enter a phone number.');
      setTimeout(() => setCopiedPhoneToast(null), 2500);
      return;
    }
    const newItem = {
      id: `queue-${Date.now()}`,
      name: newQueueName.trim() || `Number ${autoCallQueue.length + 1}`,
      phone: newQueuePhone.trim(),
      status: 'pending' as const
    };
    setAutoCallQueue(prev => [...prev, newItem]);
    setNewQueueName('');
    setNewQueuePhone('');
    setCopiedPhoneToast('✓ Added number to auto-dial queue!');
    setTimeout(() => setCopiedPhoneToast(null), 2500);
  };

  // Direct In-App Voice & SIM Live Calling
  const handleDirectSimLiveCall = (numberToDial?: string, simSlot: 'in_app' | 'sim1' | 'sim2' = 'in_app') => {
    let cleanNumber = (numberToDial || targetNumber || '').trim();
    let contactName = targetName.trim();

    if (!cleanNumber) {
      if (contacts && contacts.length > 0 && contacts[0]?.phone) {
        cleanNumber = contacts[0].phone;
        contactName = contacts[0].name || 'Selected Contact';
        setTargetName(contactName);
      } else {
        setCallNotice({ type: 'error', message: 'Please enter a phone number on the dialpad or pick a contact first.' });
        return;
      }
    }

    setSelectedSimTrunk(simSlot);
    setTargetNumber(cleanNumber);
    void startOriginalVoiceCall(cleanNumber, undefined, contactName);
  };

  const getVoipRate = (phoneNumber: string) => {
    const clean = (phoneNumber || '').replace(/[^\d+]/g, '');
    if (clean.startsWith('+1') || clean.startsWith('1')) return { country: 'United States & Canada', flag: '🇺🇸', rate: 'FREE ($0.00/min)', costPerSec: 0 };
    if (clean.startsWith('+44') || clean.startsWith('44')) return { country: 'United Kingdom', flag: '🇬🇧', rate: 'FREE ($0.00/min)', costPerSec: 0 };
    if (clean.startsWith('+91') || clean.startsWith('91')) return { country: 'India', flag: '🇮🇳', rate: 'FREE ($0.00/min)', costPerSec: 0 };
    if (clean.startsWith('+61') || clean.startsWith('61')) return { country: 'Australia', flag: '🇦🇺', rate: 'FREE ($0.00/min)', costPerSec: 0 };
    if (clean.startsWith('+49') || clean.startsWith('+33') || clean.startsWith('+39') || clean.startsWith('+34')) return { country: 'European Union', flag: '🇪🇺', rate: 'FREE ($0.00/min)', costPerSec: 0 };
    return { country: 'Global VoIP Line', flag: '🌐', rate: 'FREE ($0.00/min)', costPerSec: 0 };
  };

  const startRealMicrophone = async () => {
    unlockAudioAndSpeech();
    if (callingEngine === 'webrtc' && webrtcManager.localStream) {
      webrtcManager.setMicrophoneMute(false);
      setIsMicListening(true);
      return;
    }
    try {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        setIsMicListening(true);
        setIsPermissionsGranted(true);
        setMicPermissionState('granted');
        try {
          localStorage.setItem('mobilevoip_mic_allowed', 'true');
        } catch {}

        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        micAnalyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const trackLevel = () => {
          if (micAnalyserRef.current) {
            micAnalyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setMicAudioLevel(Math.min(100, Math.round(avg * 2.2)));
            micAnimationRef.current = requestAnimationFrame(trackLevel);
          }
        };
        micAnimationRef.current = requestAnimationFrame(trackLevel);
      }
    } catch (err: any) {
      setIsMicListening(false);
      setCallNotice({ type: 'error', message: err?.message || 'Microphone access denied or unavailable.' });
    }
  };

  const stopRealMicrophone = () => {
    if (callingEngine === 'webrtc' && webrtcManager.localStream) {
      webrtcManager.setMicrophoneMute(true);
    }
    if (micAnimationRef.current) {
      cancelAnimationFrame(micAnimationRef.current);
      micAnimationRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    setMicAudioLevel(0);
    setIsMicListening(false);
  };

  useEffect(() => {
    try {
      localStorage.setItem('applet_calling_engine', callingEngine);
    } catch {}
  }, [callingEngine]);

  useEffect(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        // @ts-ignore
        navigator.permissions.query({ name: 'microphone' }).then((res: any) => {
          setMicPermissionState(res.state);
          res.onchange = () => setMicPermissionState(res.state);
        }).catch(() => {});
      }
    } catch {}
  }, []);

  // Real-time clock ticker for countdowns and schedule triggers
  const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());
  useEffect(() => {
    const ticker = setInterval(() => {
      setCurrentTimeTick(Date.now());
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const pendingScheduledCalls = scheduledCalls.filter(s => s.status === 'pending');

  const getCountdownText = (dateStr: string, timeStr: string) => {
    try {
      const target = new Date(`${dateStr}T${timeStr}:00`).getTime();
      const diff = target - currentTimeTick;
      if (diff <= 0) return 'Due now';
      const totalSecs = Math.floor(diff / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const minutes = Math.floor((totalSecs % 3600) / 60);
      const seconds = totalSecs % 60;
      if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
      }
      return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    } catch {
      return 'Scheduled';
    }
  };

  const applyQuickPreset = (minutesToAdd: number) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutesToAdd);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    setScheduleDate(`${y}-${m}-${day}`);
    setScheduleTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
  };

  const applyTomorrowMorning = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    setScheduleDate(`${y}-${m}-${day}`);
    setScheduleTime('10:00');
  };

  const handleSaveScheduledCall = () => {
    if (!targetNumber.trim()) {
      setScheduleToast({ text: 'Please enter a valid phone number to schedule.', type: 'error' });
      setTimeout(() => setScheduleToast(null), 3000);
      return;
    }

    const newScheduledItem: ScheduledCallItem = {
      id: `sched-${Date.now()}`,
      name: targetName.trim() || 'Scheduled Contact',
      phone: targetNumber.trim(),
      scheduledDate: scheduleDate,
      scheduledTime: scheduleTime,
      agentId: scheduleAgentId,
      callReason: callReason,
      status: 'pending',
      autoDialOnTrigger: false,
      createdAt: new Date().toISOString()
    };

    setScheduledCalls(prev => [newScheduledItem, ...prev]);
    setShowScheduleModal(false);
    setScheduleToast({
      text: `✓ Call scheduled for ${newScheduledItem.name} at ${newScheduledItem.scheduledTime}`,
      type: 'success'
    });
    setTimeout(() => setScheduleToast(null), 4500);
  };

  const handleDeleteScheduledCall = (id: string) => {
    setScheduledCalls(prev => prev.filter(s => s.id !== id));
    setScheduleToast({ text: 'Scheduled call cancelled.', type: 'info' });
    setTimeout(() => setScheduleToast(null), 3000);
  };

  const handleClearFinishedScheduledCalls = () => {
    setScheduledCalls(prev => prev.filter(s => s.status === 'pending'));
  };

  useEffect(() => {
    if (initialContact) {
      setTargetName(initialContact.name);
      setTargetNumber(initialContact.phone);
    }
  }, [initialContact]);

  // Live session states: 'idle' | 'dialing' | 'ringing' | 'inbound_ringing' | 'connected' | 'hold' | 'ended'
  const [sessionState, setSessionState] = useState<'idle' | 'dialing' | 'ringing' | 'inbound_ringing' | 'connected' | 'hold' | 'ended'>('idle');
  sessionStateRef.current = sessionState;
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [volume, setVolume] = useState(85);
  const [showKeypad, setShowKeypad] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [userTextInput, setUserTextInput] = useState('');
  const [isMicListening, setIsMicListening] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment>('positive');
  const [latencyMs, setLatencyMs] = useState(290);
  const [lastFinishedCall, setLastFinishedCall] = useState<CallLog | null>(null);

  // Audio visualization
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef<TranscriptMessage[]>(transcript);

  useEffect(() => {
    transcriptRef.current = transcript;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Duration timer
  useEffect(() => {
    if (sessionState === 'connected' || sessionState === 'hold') {
      timerRef.current = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionState]);

  // Audio waveform visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const renderWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      const active = (sessionState === 'connected' && (isAgentSpeaking || isMicListening));
      const bars = 36;
      const barWidth = width / bars - 2;

      for (let i = 0; i < bars; i++) {
        const x = i * (barWidth + 2);
        let amplitude = 4;
        if (active) {
          amplitude = Math.sin(phase + i * 0.35) * (height * 0.38) + (Math.cos(phase * 1.5 + i * 0.2) * 8);
          amplitude = Math.max(4, Math.abs(amplitude));
        } else if (sessionState === 'connected') {
          amplitude = 6 + Math.sin(phase + i * 0.2) * 3;
        }

        ctx.fillStyle = isAgentSpeaking ? '#10B981' : isMicListening ? '#38BDF8' : '#64748B';
        ctx.beginPath();
        ctx.roundRect(x, centerY - amplitude / 2, barWidth, amplitude, 2);
        ctx.fill();
      }

      phase += 0.12;
      animationFrameRef.current = requestAnimationFrame(renderWave);
    };

    animationFrameRef.current = requestAnimationFrame(renderWave);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [sessionState, isAgentSpeaking, isMicListening]);

  // Quick preset contacts (empty per user instructions to delete all existing phone numbers and names)
  const demoContacts: Array<{ name: string; phone: string; role?: string; scenario: string }> = [];

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Helper to start listening to caller's mic
  const startListeningCaller = () => {
    if (isMuted || isOnHold) return;
    unlockAudioAndSpeech();
    setIsMicListening(true);
    startRealMicrophone();
  };

  const handleImportAllContactsToQueue = () => {
    if (!contacts || contacts.length === 0) {
      setCopiedPhoneToast('No saved contacts to import.');
      setTimeout(() => setCopiedPhoneToast(null), 2500);
      return;
    }
    const imported = contacts.map((c, i) => ({
      id: c.id || `imp-${i}-${Date.now()}`,
      name: c.name || `Contact ${i + 1}`,
      phone: c.phone,
      status: 'pending' as const
    }));
    setAutoCallQueue(imported);
    setCopiedPhoneToast(`✓ Imported ${imported.length} contacts into auto-dial queue!`);
    setTimeout(() => setCopiedPhoneToast(null), 3000);
  };

  // Subscribe to real WebRTC signaling & audio events for outgoing calls
  useEffect(() => {
    const unsubscribe = webrtcManager.subscribe({
      onAudioLevel: (lvl) => {
        setMicAudioLevel(lvl);
      },
      onIceStateChange: (state) => {
        setIceStatusLabel(state);
      },
      onCallRinging: (info) => {
        setSessionState('ringing');
        setTargetName(info.targetName || targetNameRef.current);
        try {
          ringback.start();
        } catch {}
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = window.setTimeout(() => {
          if (sessionStateRef.current === 'ringing' || sessionStateRef.current === 'dialing') {
            ringback.stop();
            webrtcManager.terminateCallSession();
            setSessionState('idle');
            const msg = `No answer from ${info.targetNumber} after 25s.`;
            setCallNotice({ type: 'warn', message: msg });
            advanceAutoCallQueue('skipped', msg);
          }
        }, 25000);
      },
      onCallConnected: (info) => {
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        try {
          ringback.stop();
          playConnectChime();
        } catch {}
        setSessionState('connected');
        setIsMicListening(true);
        setCallDuration(0);
        setCopiedPhoneToast(`🟢 Original 2-Way Voice Connected with ${info.peerName || info.peerNumber}`);
        setTimeout(() => setCopiedPhoneToast(null), 3500);
        setTranscript((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            sender: 'system',
            text: `Original two-way WebRTC voice stream connected with ${info.peerName || info.peerNumber}.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          }
        ]);
      },
      onPeerOffline: (info) => {
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        ringback.stop();
        setSessionState('idle');
        setCallNotice({ type: 'error', message: info.reason });
        setCopiedPhoneToast(info.reason);
        setTimeout(() => setCopiedPhoneToast(null), 4000);
        advanceAutoCallQueue('skipped', info.reason);
      },
      onCallRejected: (info) => {
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        ringback.stop();
        setSessionState('idle');
        setCallNotice({ type: 'warn', message: info.reason });
        setCopiedPhoneToast(info.reason);
        setTimeout(() => setCopiedPhoneToast(null), 3500);
        advanceAutoCallQueue('skipped', info.reason);
      },
      onCallEnded: () => {
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        if (['connected', 'ringing', 'dialing', 'hold'].includes(sessionStateRef.current)) {
          finalizeEndedCall(false);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Clean up all timers and audio on unmount
  useEffect(() => {
    return () => {
      if (digitDialIntervalRef.current) clearInterval(digitDialIntervalRef.current);
      if (connectDelayTimerRef.current) clearTimeout(connectDelayTimerRef.current);
      if (autoCallCooldownTimerRef.current) clearInterval(autoCallCooldownTimerRef.current);
      if (autoDialDebounceRef.current) clearTimeout(autoDialDebounceRef.current);
      if (ringingTimerRef.current) clearTimeout(ringingTimerRef.current);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringback.stop();
      holdMusic.stop();
      speechEngine.stopSpeaking();
      stopRealMicrophone();
    };
  }, []);

  // Auto-start call or multi-number auto-calling loop once when autoStart is active
  useEffect(() => {
    if (!autoStart) {
      hasAutoStartedRef.current = false;
      return;
    }
    if (autoStart && sessionStateRef.current === 'idle' && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      const timer = window.setTimeout(() => {
        if (initialContact?.phone) {
          setTargetName(initialContact.name || 'Contact');
          setTargetNumber(initialContact.phone);
          targetNameRef.current = initialContact.name || 'Contact';
          targetNumberRef.current = initialContact.phone;
          handlePerformAutomaticNumberDialing(initialContact.phone);
        } else if (initialTab === 'auto_calling') {
          setDialerTab('auto_calling');
          if (autoCallQueueRef.current.length > 0) {
            handleStartAutoCallingLoop(0);
          }
        } else if (targetNumberRef.current || contacts[0]?.phone) {
          const numToDial = targetNumberRef.current || contacts[0].phone;
          handlePerformAutomaticNumberDialing(numToDial);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoStart, initialTab, initialContact?.phone]);

  // Start Live In-App Connection
  const handleInitiateLiveCall = (overrideNumber?: string, overrideSim?: 'in_app' | 'sim1' | 'sim2' | 'webrtc') => {
    if (overrideSim) setSelectedSimTrunk(overrideSim);
    void startOriginalVoiceCall(overrideNumber);
  };

  // Scheduled Call Reminder: when scheduled time arrives, alert the user and load dialer (NO auto-dialing)
  useEffect(() => {
    if (sessionState !== 'idle') return;

    const now = new Date();
    const nowMs = now.getTime();

    scheduledCalls.forEach(item => {
      if (item.status === 'pending') {
        const itemTime = new Date(`${item.scheduledDate}T${item.scheduledTime}:00`).getTime();
        // If scheduled time has arrived (within a 2-minute window)
        if (nowMs >= itemTime && (nowMs - itemTime) < 120000) {
          // Mark as completed so it doesn't trigger multiple times
          setScheduledCalls(prev => prev.map(s => s.id === item.id ? { ...s, status: 'completed' } : s));

          // Set call details ready on dialer for the user to review
          setTargetName(item.name);
          setTargetNumber(item.phone);
          setCallReason(item.callReason);
          if (item.agentId) onSelectAgent(item.agentId);

          playConnectChime();
          setScheduleToast({
            text: `⏰ Scheduled Reminder: Call ready for ${item.name} (${item.phone})! Tap "Dial Now" when ready.`,
            type: 'info'
          });
          setTimeout(() => setScheduleToast(null), 6000);
          // NO auto-dialing! The user must click the Call button!
        }
      }
    });
  }, [currentTimeTick, scheduledCalls, sessionState]);

  // Answer Inbound Call (Human-to-Human: NO robot voice)
  const handleAnswerInbound = () => {
    ringback.stop();
    playConnectChime();
    setSessionState('connected');
    setCallDuration(0);
    setTranscript([]);
    startRealMicrophone();
  };

  // Decline Inbound Call
  const handleDeclineInbound = () => {
    ringback.stop();
    setSessionState('idle');
  };

  // Send User Message (Speech or Text)
  const handleSendUserMessage = (text: string) => {
    if (!text.trim() || sessionState !== 'connected') return;

    speechEngine.stopListening();
    setIsMicListening(false);

    const userMsg: TranscriptMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    const updatedTranscript = [...transcriptRef.current, userMsg];
    setTranscript(updatedTranscript);
    setUserTextInput('');

    // Direct Live Call to Person: The robot does NOT speak!
    // Caller's live audio / speech turn is transmitted directly and microphone stays live
    setTimeout(() => {
      if (sessionState === 'connected' && !isMuted && !isOnHold) {
        startListeningCaller();
      }
    }, 200);
  };

  // Toggle Microphone
  const handleToggleMic = () => {
    if (isMicListening) {
      stopRealMicrophone();
    } else {
      startRealMicrophone();
    }
  };

  // Toggle Hold
  const handleToggleHold = () => {
    if (isOnHold) {
      holdMusic.stop();
      setIsOnHold(false);
      setSessionState('connected');
    } else {
      speechEngine.stopSpeaking();
      setIsAgentSpeaking(false);
      holdMusic.start();
      setIsOnHold(true);
      setSessionState('hold');
    }
  };

  // DTMF key press
  const handlePressKeypad = (digit: string) => {
    playDtmfTone(digit);
    vonageVoiceManager.sendDTMF(digit);
    if (sessionState === 'connected') {
      const keypadMsg: TranscriptMessage = {
        id: `msg-${Date.now()}`,
        sender: 'user',
        text: `[Keypad Pressed: ${digit}]`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      setTranscript(prev => [...prev, keypadMsg]);
    }
  };

  // End Call
  const finalizeEndedCall = (notifyPeer: boolean) => {
    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (digitDialIntervalRef.current) {
      clearInterval(digitDialIntervalRef.current);
      digitDialIntervalRef.current = null;
    }
    if (connectDelayTimerRef.current) {
      clearTimeout(connectDelayTimerRef.current);
      connectDelayTimerRef.current = null;
    }
    if (autoDialDebounceRef.current) {
      clearTimeout(autoDialDebounceRef.current);
      autoDialDebounceRef.current = null;
    }
    stopRealMicrophone();
    vonageVoiceManager.endCall().catch(() => {});
    agoraVoiceManager.leaveVoiceChannel().catch(() => {});
    if (notifyPeer) {
      webrtcManager.terminateCallSession();
    }
    ringback.stop();
    holdMusic.stop();
    speechEngine.stopSpeaking();
    speechEngine.stopListening();
    playEndCallChime();

    const finalDuration = callDuration;
    const cost = 0.00;

    const finishedLog: CallLog = {
      id: `call-live-${Date.now().toString(36)}`,
      callerName: targetNameRef.current || targetNumberRef.current || 'Voice Contact',
      callerNumber: targetNumberRef.current || 'Unknown',
      agentId: callingEngine,
      agentName: callingEngine === 'agora' ? 'Agora RTC Voice' : callingEngine === 'vonage' ? 'PSTN / SIP Trunk' : 'Original WebRTC Voice',
      timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      direction: 'outbound',
      durationSeconds: finalDuration,
      disposition: finalDuration > 0 ? 'Completed' : 'Dropped',
      sentiment: sentiment,
      cost: cost,
      latencyMs: latencyMs,
      summary: `Original two-way voice call (${callingEngine.toUpperCase()}) with ${targetNameRef.current || targetNumberRef.current}. Duration: ${finalDuration}s.`,
      keyEntities: {
        'Method': callingEngine === 'vonage' ? 'PSTN / SIP API' : callingEngine === 'agora' ? 'Agora RTC' : 'WebRTC Direct P2P',
        'Scenario': callScenario,
        'Audio': '2-Way Hardware Microphone'
      },
      transcript: transcriptRef.current
    };

    setLastFinishedCall(finishedLog);
    setSessionState('ended');
    onCallFinished(finishedLog);

    if (isAutoCallingActiveRef.current) {
      advanceAutoCallQueue(finalDuration > 0 ? 'completed' : 'skipped');
    }
  };

  const handleEndCall = () => {
    finalizeEndedCall(true);
  };
  handleEndCallRef.current = handleEndCall;

  // Optional max call duration timer in Auto-Calling (0 = unlimited manual hangup)
  useEffect(() => {
    if (isAutoCallingActive && sessionState === 'connected') {
      const idx = autoCallIndexRef.current;
      setAutoCallQueue(prev => prev.map((item, i) => (i === idx ? { ...item, status: 'connected' } : item)));

      if (autoCallDurationLimitRef.current > 0) {
        const timer = window.setTimeout(() => {
          if (!isAutoCallingActiveRef.current) return;
          handleEndCallRef.current();
        }, autoCallDurationLimitRef.current * 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAutoCallingActive, sessionState, autoCallIndex, autoCallDurationLimit]);

  return (
    <div className="w-full flex flex-col gap-4 max-w-4xl mx-auto pb-10">
      {/* Top Header Bar */}
      <div className="w-full bg-gradient-to-r from-[#0052CC] via-[#023E99] to-[#041E42] text-white p-4 rounded-xl shadow-md flex items-center justify-between border border-blue-400/30">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-1.5 rounded-lg bg-blue-900/80 hover:bg-blue-800 text-white transition active:scale-95"
            title="Back to Menu"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5 text-blue-200" />
                <span>RoboVoiceCall In-App Voice Dialer</span>
              </h1>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                100% IN-APP VOICE
              </span>
            </div>
            <p className="text-xs text-blue-100">
              100% in-app WebRTC calling with verified caller ID, spam protection shield & HD audio recording
            </p>
          </div>
        </div>

        {/* Quota Badge */}
        <div className="hidden sm:flex flex-col items-end text-xs">
          <span className="text-blue-200 font-medium">Free Lifetime Airtime</span>
          <span className="font-mono font-bold text-white text-sm">
            {formatTime(trialBalance.minutesLeftSeconds)} left
          </span>
        </div>
      </div>

      {/* Copied Phone Number Toast for Mobile Handset Dialing */}
      {copiedPhoneToast && (
        <div className="p-3 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-between shadow-lg animate-fade-in border border-blue-400">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-200 animate-bounce" />
            <span>{copiedPhoneToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setCopiedPhoneToast(null)}
            className="text-xs bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Container */}
      {sessionState === 'idle' && (
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left Column: In-App Smart Dialer Deck */}
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
            {/* Connection Mode Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-emerald-600" />
                  <span>VoIP Protocol Mode</span>
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* WebRTC Diagnostics */}
                  <button
                    type="button"
                    onClick={() => {
                      setCallingEngine('webrtc');
                      setShowWebRTCDiagnostics(true);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-2xs transition active:scale-95 cursor-pointer ${
                      callingEngine === 'webrtc'
                        ? 'bg-blue-600 text-white border border-blue-700 shadow-sm'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
                    }`}
                    title="WebRTC Direct P2P Audio"
                  >
                    <Activity className="w-3 h-3 text-blue-400" />
                    <span>WebRTC Direct</span>
                    {callingEngine === 'webrtc' && <CheckCircle2 className="w-3 h-3 text-emerald-300 ml-0.5" />}
                  </button>

                  {/* Vonage Voice API Engine Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setCallingEngine('vonage');
                      setShowVonageSettings(true);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-2xs transition active:scale-95 cursor-pointer ${
                      callingEngine === 'vonage'
                        ? 'bg-purple-700 text-white border border-purple-800 shadow-sm'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200'
                    }`}
                    title="Vonage Voice API"
                  >
                    <PhoneCall className="w-3 h-3 text-purple-300 animate-pulse" />
                    <span>Vonage Voice</span>
                    {callingEngine === 'vonage' && <CheckCircle2 className="w-3 h-3 text-emerald-300 ml-0.5" />}
                  </button>

                  {/* Agora Engine Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setCallingEngine('agora');
                      setShowAgoraSettings(true);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-2xs transition active:scale-95 cursor-pointer ${
                      callingEngine === 'agora'
                        ? 'bg-sky-600 text-white border border-sky-700 shadow-sm'
                        : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200'
                    }`}
                    title="Agora SD-RTN™ Voice Engine"
                  >
                    <Radio className="w-3 h-3 text-sky-300 animate-pulse" />
                    <span>Agora SD-RTN™</span>
                    {callingEngine === 'agora' && <CheckCircle2 className="w-3 h-3 text-emerald-300 ml-0.5" />}
                  </button>
                </div>
              </div>

              {/* Direct Human Voice Calling Line Banner */}
              <div className="mb-3 p-3 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-blue-500/40 rounded-xl text-xs text-white shadow-md flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <span className="font-extrabold text-blue-300 block text-xs truncate">
                      Direct Human Calling Line • High-Definition VoIP & WebRTC
                    </span>
                    <span className="text-[11px] text-slate-300 block truncate">
                      Instant two-way voice connection. Talk directly with real people — 100% human audio, 0% robot voice.
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500 text-white uppercase shrink-0">
                  Direct Line
                </span>
              </div>

              {/* Live Call Notice Alert */}
              {callNotice && (
                <div className={`mb-3 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-sm animate-fade-in ${
                  callNotice.type === 'error'
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : callNotice.type === 'warn'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  <div className="flex items-center gap-2">
                    {callNotice.type === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span className="font-medium">{callNotice.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCallNotice(null)}
                    className="text-slate-500 hover:text-slate-800 text-xs font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Microphone Permission Warning / Quick Fix Banner */}
              {micPermissionState === 'denied' && (
                <div className="mb-3 p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-950 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="leading-tight">Microphone is blocked by browser settings. WebRTC voice needs microphone access.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWebRTCDiagnostics(true)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] shrink-0 transition"
                  >
                    Open Inspector
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConnectMode('outbound')}
                  className={`p-2.5 rounded-lg border text-left transition flex items-center justify-between ${
                    connectMode === 'outbound'
                      ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-500/40 text-blue-900'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/60 text-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold">Original 2-Way Call (WebRTC)</span>
                  {connectMode === 'outbound' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowPermissionsModal(true)}
                  className="p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 bg-slate-50/60 text-slate-700 text-left transition flex items-center justify-between cursor-pointer"
                >
                  <span className="text-xs font-bold">
                    {wsConnected ? `Online (${myNumber || 'Unregistered'})` : 'Signaling Offline'}
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                </button>
              </div>
            </div>

            {/* Master Automatic Numbers Dialing Banner */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border-2 border-emerald-500/70 text-white shadow-xl flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/40">
                  <PhoneCall className="w-5 h-5 text-emerald-400 animate-bounce" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-black text-sm tracking-wide text-white uppercase truncate">
                      Automatic Numbers Dialing
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-300 block truncate">
                    {isAutoCallingActive 
                      ? `Now Dialing Number ${autoCallIndex + 1} of ${autoCallQueue.length} in Phone...` 
                      : `Auto-dials ${autoCallQueue.length} phone numbers sequentially in phone`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isAutoCallingActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDialerTab('auto_calling');
                      handleStartAutoCallingLoop(0);
                    }}
                    className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer ring-2 ring-emerald-300"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Auto-Dial All Numbers 📞</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopAutoCallingLoop}
                    className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md transition active:scale-95 flex items-center gap-1 cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Stop Auto-Dial</span>
                  </button>
                )}
              </div>
            </div>

            {/* View Mode Tab (Smart Dialer vs Auto-Calling vs Contacts) */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setDialerTab('smart_dialer')}
                className={`flex-1 py-1.5 rounded-md font-bold transition flex items-center justify-center gap-1.5 ${
                  dialerTab === 'smart_dialer'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeypadIcon className="w-3.5 h-3.5" />
                <span>Smart Dialer</span>
              </button>

              <button
                type="button"
                onClick={() => setDialerTab('auto_calling')}
                className={`flex-1 py-1.5 rounded-md font-bold transition flex items-center justify-center gap-1.5 ${
                  dialerTab === 'auto_calling'
                    ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                    : 'text-emerald-700 hover:text-emerald-900 bg-emerald-50/80'
                }`}
              >
                <PhoneCall className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                <span>⚡ Auto-Calling ({autoCallQueue.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setDialerTab('contacts')}
                className={`flex-1 py-1.5 rounded-md font-bold transition flex items-center justify-center gap-1.5 ${
                  dialerTab === 'contacts'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Contacts ({contacts.length})</span>
              </button>
            </div>

            {dialerTab === 'smart_dialer' ? (
              <div className="flex flex-col gap-3.5">
                {/* In-App Voice Live Call Mode Banner */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-[#0052CC] via-[#023E99] to-[#0D47A1] border border-blue-400/50 text-white shadow-md flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white shadow-sm ring-1 ring-white/30 shrink-0">
                      <PhoneCall className="w-4 h-4 text-emerald-300 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <span className="text-xs font-black tracking-wide uppercase text-white">
                          In-App Voice • Live Call Connect
                        </span>
                      </div>
                      <p className="text-[10px] text-blue-200">100% In-App WebRTC Bridge & High-Definition Voice Audio Ready</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleConnectInAppCall(targetNumber);
                      }}
                      className="text-xs font-extrabold px-3 py-1.5 rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white ring-1 ring-emerald-300 active:scale-95"
                      title="Start Live Call 100% Inside RoboVoiceCall"
                    >
                      <Phone className="w-3.5 h-3.5 fill-current" />
                      <span>Start Call Now 📞</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPermissionsModal(true)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg shadow-xs transition flex items-center gap-1 cursor-pointer bg-blue-800 hover:bg-blue-700 text-blue-100 border border-blue-400/40"
                      title="All MobileVOIP & SIM Permissions Allowed"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Allowed 🟢</span>
                    </button>
                  </div>
                </div>

                {/* Live Online In-App Peers (Dial another browser tab / device registered on /ws/signaling) */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${onlinePeers.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      <span>Online In-App Peers ({onlinePeers.length})</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-800">
                      My Number: {myNumber || 'Unregistered'}
                    </span>
                  </div>
                  {onlinePeers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {onlinePeers.map((peer) => (
                        <button
                          key={peer.clientId}
                          type="button"
                          onClick={() => {
                            void startOriginalVoiceCall(peer.phone, peer.clientId, peer.name);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{peer.name}</span>
                          <span className="font-mono text-[10px] text-slate-500">({peer.phone})</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-emerald-900 leading-snug">
                      No other in-app peers connected right now. Open a second browser tab or device, register a number under <strong>My Number</strong> on Home, and dial it here for real two-way voice.
                    </p>
                  )}
                </div>

                {/* Verified In-App Caller ID Card */}
                {(() => {
                  const meta = getCallerIdMeta(targetNumber, targetName);
                  return (
                    <div className="rounded-xl p-4 bg-gradient-to-br from-[#0052CC] via-[#023E99] to-[#041E42] text-white shadow-md relative overflow-hidden border border-blue-400/40">
                      {/* Top Verification Header */}
                      <div className="flex items-center justify-between text-[11px] mb-3">
                        <span className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-blue-200">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-300" />
                          <span>RoboVoiceCall Verified Caller ID</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold text-[10px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>0% Spam • Safe</span>
                        </span>
                      </div>

                      {/* Main Contact Presentation */}
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-full bg-white text-[#0052CC] font-black text-xl flex items-center justify-center shadow-lg relative shrink-0">
                          {targetName ? targetName.charAt(0).toUpperCase() : (targetNumber ? targetNumber.charAt(0) : <Phone className="w-5 h-5 text-[#0052CC]" />)}
                          {Boolean(targetName || targetNumber) && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center border border-white">
                              <CheckCircle2 className="w-3 h-3" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={targetName}
                              onChange={(e) => setTargetName(e.target.value)}
                              placeholder={targetNumber ? "Identified Caller Name" : "Enter name or dial below"}
                              className="font-bold text-base bg-transparent text-white placeholder-blue-300/60 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 w-full truncate"
                            />
                            {Boolean(targetName) && <CheckCircle2 className="w-4 h-4 text-blue-300 shrink-0" />}
                          </div>

                          <div className="text-xs text-blue-100 flex items-center gap-2 mt-0.5">
                            <span>{meta.operator}</span>
                            <span>•</span>
                            <span>{meta.location}</span>
                          </div>
                        </div>
                      </div>

                      {/* In-App Call Reason Selector */}
                      <div className="mt-3 pt-3 border-t border-blue-400/30 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                          Call Reason (Seen before pickup):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            '⚡ Urgent Call',
                            '💼 Business Inquiry',
                            '📦 Order & Delivery',
                            '🤝 Meeting Follow-up',
                            '📅 Appointment'
                          ].map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => setCallReason(reason)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                                callReason === reason
                                  ? 'bg-amber-400 text-slate-950 shadow-sm ring-1 ring-white'
                                  : 'bg-white/15 text-blue-100 hover:bg-white/25'
                              }`}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* In-App Auto-Recording Badge */}
                      <div className="mt-3 flex items-center justify-between text-[11px] bg-black/20 p-2 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setIsRecording(!isRecording)}
                          className="flex items-center gap-1.5 text-slate-100 hover:text-white font-medium"
                        >
                          <Disc className={`w-3.5 h-3.5 ${isRecording ? 'text-red-400 animate-spin' : 'text-slate-400'}`} />
                          <span>In-App Auto-Record: <strong className={isRecording ? 'text-emerald-300' : 'text-slate-400'}>{isRecording ? 'ENABLED (HD Audio)' : 'DISABLED'}</strong></span>
                        </button>
                        <span className="text-[10px] font-mono text-emerald-300 font-bold">100% In-App Voice Ready</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Dialpad Number Input Display */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 shadow-inner">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={targetNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTargetNumber(val);
                        if (autoDialMode && !isAutoDialingSequenceRef.current && sessionState === 'idle') {
                          const digits = val.replace(/[^\d]/g, '');
                          if (digits.length >= 10) {
                            if (autoDialDebounceRef.current) clearTimeout(autoDialDebounceRef.current);
                            autoDialDebounceRef.current = window.setTimeout(() => {
                              handleConnectInAppCall(val);
                            }, 750);
                          }
                        }
                      }}
                      placeholder="Enter phone number..."
                      className="w-full text-xl sm:text-2xl font-mono font-bold text-slate-900 bg-transparent focus:outline-none tracking-wide"
                    />
                  </div>
                  {targetNumber && (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          playDtmfTone('#');
                        } catch (e) {}
                        setTargetNumber(prev => prev.slice(0, -1));
                      }}
                      className="p-2 text-slate-500 hover:text-red-600 hover:bg-slate-200/60 rounded-lg transition"
                      title="Backspace"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Smart Matching Contacts suggestion */}
                {(() => {
                  const matches = targetNumber.trim().length > 0 
                    ? contacts.filter(c => 
                        c.phone.replace(/[^\d]/g, '').includes(targetNumber.replace(/[^\d]/g, '')) ||
                        c.name.toLowerCase().includes(targetNumber.toLowerCase())
                      ).slice(0, 2)
                    : [];

                  if (matches.length === 0) return null;
                  return (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      <span className="text-[10px] font-bold uppercase text-blue-600 shrink-0">Contact Match:</span>
                      {matches.map(m => (
                        <button
                          key={m.id || m.phone}
                          type="button"
                          onClick={() => {
                            setTargetName(m.name);
                            setTargetNumber(m.phone);
                            if (autoDialMode) {
                              handleConnectInAppCall(m.phone);
                            }
                          }}
                          className="px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition"
                        >
                          <CheckCircle2 className="w-3 h-3 text-blue-600" />
                          <span>{m.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 font-normal">({m.phone})</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* Automatic Numbers Dialing Mode Banner */}
                <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 rounded-xl border border-blue-500/40 text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${autoDialMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                    <div>
                      <span className="font-extrabold text-white block">Automatic Numbers Dialing Inside App</span>
                      <span className="text-[10px] text-blue-200">Auto-dial & connect call 100% inside RoboVoiceCall • Call received</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoDialMode(!autoDialMode)}
                    className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wide transition cursor-pointer ${
                      autoDialMode 
                        ? 'bg-emerald-500 text-slate-950 shadow-md ring-1 ring-emerald-300' 
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {autoDialMode ? 'AUTO-DIAL ON 🟢' : 'OFF'}
                  </button>
                </div>

                {/* T9 Smart Dialpad (3x4 Grid) */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {DIALPAD_KEYS.map((item) => (
                    <button
                      key={item.num}
                      type="button"
                      onClick={() => {
                        try {
                          unlockAudioAndSpeech();
                          playDtmfTone(item.num);
                        } catch (e) {}
                        setTargetNumber(prev => {
                          const next = prev + item.num;
                          const found = contacts.find(c => c.phone.replace(/[^\d]/g, '').includes(next.replace(/[^\d]/g, '')));
                          if (found) setTargetName(found.name);

                          // Automatic Numbers Dialing in phone when standard number length (10 digits) is reached
                          if (autoDialMode && !isAutoDialingSequenceRef.current && sessionState === 'idle') {
                            const digits = next.replace(/[^\d]/g, '');
                            if (digits.length >= 10) {
                              if (autoDialDebounceRef.current) clearTimeout(autoDialDebounceRef.current);
                              autoDialDebounceRef.current = window.setTimeout(() => {
                                handleConnectInAppCall(next);
                              }, 650);
                            }
                          }

                          return next;
                        });
                      }}
                      className={`py-3 rounded-xl flex flex-col items-center justify-center shadow-sm transition cursor-pointer group ${
                        activeDialingDigit === item.num
                          ? 'bg-blue-600 text-white border-2 border-blue-400 scale-105 shadow-xl ring-4 ring-sky-300'
                          : 'bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 active:scale-95'
                      }`}
                    >
                      <span className={`text-xl font-mono font-bold ${
                        activeDialingDigit === item.num
                          ? 'text-white scale-110'
                          : 'text-slate-800 group-hover:text-blue-600'
                      }`}>
                        {item.num}
                      </span>
                      {item.sub && (
                        <span className={`text-[9px] font-mono tracking-wider ${
                          activeDialingDigit === item.num
                            ? 'text-blue-100 font-bold'
                            : 'text-slate-400 group-hover:text-blue-500 font-semibold'
                        }`}>
                          {item.sub}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 1-Tap Automatic Dialing Action Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePerformAutomaticNumberDialing(targetNumber);
                  }}
                  disabled={isAutoDialingSequence}
                  className="w-full py-3 px-5 rounded-xl text-white font-extrabold text-sm shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 ring-2 ring-emerald-400/40"
                  title="Automatically dials the digits one-by-one on the keypad with real DTMF audio, connects, and receives call"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200 animate-spin" />
                  <span>
                    {isAutoDialingSequence 
                      ? '⚡ Dialing Digits in Phone Automatically...' 
                      : '⚡ Automatic Dialing the Numbers (Watch & Call) 📞'}
                  </span>
                </button>

                {/* Primary Hero Call Connect Button: 100% In-App Call */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleConnectInAppCall(targetNumber);
                  }}
                  className="w-full py-4 px-6 rounded-xl text-white font-black text-sm sm:text-base shadow-xl transition active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer bg-gradient-to-r from-blue-600 via-sky-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 shadow-blue-950/40 ring-2 ring-sky-400/50"
                  title="Automatic Numbers Dialing & Connect 100% Inside RoboVoiceCall"
                >
                  <PhoneCall className="w-5 h-5 text-white animate-bounce" />
                  <span>Start In-App Call & Receive Live 📞</span>
                </button>

                {/* 1-Tap Automatic Numbers Dialing Quick Chips */}
                {contacts && contacts.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                      <span className="flex items-center gap-1.5 text-blue-700">
                        <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                        <span>1-Tap Automatic Numbers Dialing:</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-normal">100% In-App Voice</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {contacts.slice(0, 4).map((c) => (
                        <button
                          key={c.id || c.phone}
                          type="button"
                          onClick={() => {
                            setTargetName(c.name);
                            setTargetNumber(c.phone);
                            handleConnectInAppCall(c.phone);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 text-slate-800 hover:text-emerald-900 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Auto-Dial {c.name.split(' ')[0]}</span>
                          <span className="font-mono text-[10px] text-slate-500">({c.phone})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Secondary In-App Calling & Scheduling Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDirectSimLiveCall(targetNumber, 'in_app')}
                    className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 border border-blue-300 cursor-pointer text-center"
                    title="Start live call directly inside RoboVoiceCall"
                  >
                    <Radio className="w-3.5 h-3.5 text-blue-700" />
                    <span>In-App Voice Bridge</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(true)}
                    className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 border border-amber-300 cursor-pointer"
                    title="Schedule call reminder"
                  >
                    <Calendar className="w-3.5 h-3.5 text-amber-700" />
                    <span>Schedule Reminder</span>
                  </button>
                </div>

                {(pendingScheduledCalls.length > 0 || onNavigateSchedule) && (
                  <div className="flex items-center gap-2">
                    {pendingScheduledCalls.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowScheduledListDrawer(true)}
                        className="flex-1 py-2 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        title="View upcoming scheduled calls queue"
                      >
                        <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                        <span>Scheduled Queue ({pendingScheduledCalls.length})</span>
                      </button>
                    )}

                    {onNavigateSchedule && (
                      <button
                        type="button"
                        onClick={onNavigateSchedule}
                        className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
                        title="Open 5-Step Bulk Auto-Dial Campaign Scheduler"
                      >
                        <span>Campaigns</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Upcoming Scheduled Dialing Live Countdown Banner */}
                {pendingScheduledCalls.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 flex flex-col gap-2 mt-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Next Scheduled Dialing ({pendingScheduledCalls.length} in queue)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowScheduledListDrawer(true)}
                        className="text-[11px] text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                      >
                        Manage All
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-amber-200 shadow-sm">
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {pendingScheduledCalls[0].name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                            WebRTC HD
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          {pendingScheduledCalls[0].phone} • {pendingScheduledCalls[0].scheduledDate} at {pendingScheduledCalls[0].scheduledTime}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                          {getCountdownText(pendingScheduledCalls[0].scheduledDate, pendingScheduledCalls[0].scheduledTime)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const item = pendingScheduledCalls[0];
                            setTargetName(item.name);
                            setTargetNumber(item.phone);
                            setCallReason(item.callReason);
                            if (item.agentId) onSelectAgent(item.agentId);
                            handleInitiateLiveCall();
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition active:scale-95 cursor-pointer"
                        >
                          Dial Now
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : dialerTab === 'auto_calling' ? (
              /* Auto-Calling Numbers Queue Tab */
              <div className="flex flex-col gap-3.5 animate-fade-in">
                {/* Hero Status & Primary Trigger */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border border-emerald-500/50 text-white shadow-lg flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${isAutoCallingActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                      <span className="font-black text-sm tracking-wide uppercase text-emerald-300">
                        {isAutoCallingActive 
                          ? `Dialing Number ${autoCallIndex + 1} of ${autoCallQueue.length} Automatically` 
                          : 'Automatic Numbers Calling System'}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-bold">
                      {isAutoCallingActive ? 'RUNNING 🟢' : `${autoCallQueue.length} In Queue`}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Dials each phone number sequentially 100% inside RoboVoiceCall, receives the call, broadcasts audio, and moves to the next number automatically.
                  </p>

                  {/* Primary Trigger / Stop Button */}
                  <div className="flex items-center gap-2 pt-1">
                    {!isAutoCallingActive ? (
                      <button
                        type="button"
                        onClick={() => handleStartAutoCallingLoop(0)}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-lg transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer ring-2 ring-emerald-400/50"
                      >
                        <PhoneCall className="w-4 h-4 text-white animate-bounce" />
                        <span>Start Automatic Numbers Calling ({autoCallQueue.length} Numbers) 📞</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStopAutoCallingLoop}
                        className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm shadow-lg transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <PhoneOff className="w-4 h-4 text-white" />
                        <span>Stop Automatic Calling ⏹</span>
                      </button>
                    )}
                  </div>

                  {/* Settings Bar */}
                  <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Interval Between Calls:</span>
                      {[3, 5, 10].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAutoCallIntervalSeconds(s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                            autoCallIntervalSeconds === s
                              ? 'bg-emerald-500 text-slate-950 font-black'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Max Call Limit:</span>
                      {[
                        { val: 0, label: 'Manual' },
                        { val: 30, label: '30s' },
                        { val: 60, label: '60s' }
                      ].map(opt => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setAutoCallDurationLimit(opt.val)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                            autoCallDurationLimit === opt.val
                              ? 'bg-emerald-500 text-slate-950 font-black'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Queue Operations Bar */}
                <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    {contacts.length > 0 && (
                      <button
                        type="button"
                        onClick={handleImportAllContactsToQueue}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold transition active:scale-95 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Users className="w-3 h-3 text-emerald-600" />
                        <span>Import {contacts.length} Contacts</span>
                      </button>
                    )}
                  </div>

                  {autoCallQueue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAutoCallQueue([])}
                      className="text-slate-500 hover:text-rose-600 text-xs font-semibold underline cursor-pointer"
                    >
                      Clear List
                    </button>
                  )}
                </div>

                {/* Add Number to Queue Input */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Add Phone Number to Auto-Calling Queue:
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newQueueName}
                      onChange={(e) => setNewQueueName(e.target.value)}
                      placeholder="Contact Name (optional)"
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={newQueuePhone}
                      onChange={(e) => setNewQueuePhone(e.target.value)}
                      placeholder="Phone number (e.g. +91 98765 43210)"
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddNumberToQueue}
                      className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                    >
                      + Add Number
                    </button>
                  </div>
                </div>

                {/* Queue Numbers List */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-bold">Phone Numbers to Call Automatically:</span>
                    <span className="font-mono text-[11px]">{autoCallQueue.length} total</span>
                  </div>

                  {autoCallQueue.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                      No phone numbers in queue. Enter a number above or import from saved contacts.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                      {autoCallQueue.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border transition flex items-center justify-between ${
                            item.status === 'dialing'
                              ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-400'
                              : item.status === 'connected'
                                ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-400'
                                : item.status === 'completed'
                                  ? 'border-slate-200 bg-slate-100/70 opacity-75'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900 truncate">{item.name}</span>
                                {item.status === 'dialing' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 animate-pulse">
                                    📞 Dialing in Phone
                                  </span>
                                )}
                                {item.status === 'connected' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                    🟢 Calling Live
                                  </span>
                                )}
                                {item.status === 'completed' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700">
                                    ✓ Done
                                  </span>
                                )}
                                {item.status === 'pending' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                    ⏳ Pending
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-mono text-slate-500 block truncate">{item.phone}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                handleStartAutoCallingLoop(idx);
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition active:scale-95 flex items-center gap-1 cursor-pointer"
                              title="Auto-dial this phone number and continue loop"
                            >
                              <PhoneCall className="w-3 h-3 text-white" />
                              <span>Auto-Dial</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAutoCallQueue(prev => prev.filter(q => q.id !== item.id));
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="Remove from queue"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Contacts Tab */
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">Tap any contact to dial or schedule</span>
                  <span className="font-mono text-[11px]">{contacts.length} saved</span>
                </div>

                {contacts.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                    No contacts imported yet. Import or add contacts in the Contacts tab to use 1-tap dialing.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id || contact.phone}
                        className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                          targetNumber === contact.phone
                            ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div 
                          className="flex items-center gap-2.5 min-w-0 pr-2 cursor-pointer flex-1"
                          onClick={() => {
                            setTargetName(contact.name);
                            setTargetNumber(contact.phone);
                            setDialerTab('smart_dialer');
                          }}
                        >
                          <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">{contact.name}</div>
                            <div className="text-[10px] font-mono text-slate-500 truncate">{contact.phone}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetName(contact.name);
                              setTargetNumber(contact.phone);
                              setShowScheduleModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs transition"
                            title="Schedule call for this contact"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetName(contact.name);
                              setTargetNumber(contact.phone);
                              setDialerTab('smart_dialer');
                              handleConnectInAppCall(contact.phone);
                            }}
                            className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold transition active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer"
                            title="Auto-dial & connect call 100% inside RoboVoiceCall"
                          >
                            <PhoneCall className="w-3 h-3 text-white" />
                            <span>Auto-Dial</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Mobile VoIP Free Rates & Network Status */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span>Mobile VoIP Free Calling</span>
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                Rate: 100% Free
              </span>
            </div>

            {/* Destination Rate Card */}
            {(() => {
              const voipRate = getVoipRate(targetNumber);
              return (
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white border border-slate-800 shadow-sm flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Destination:</span>
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span>{voipRate.flag}</span>
                      <span>{voipRate.country}</span>
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between border-t border-slate-800/80 pt-2">
                    <span className="text-xs text-slate-400">VoIP Calling Rate:</span>
                    <div className="text-right">
                      <span className="text-base font-extrabold font-mono text-emerald-300 block">
                        $0.00 / Free
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                        Unlimited Free VoIP Calls
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                    <span>Roaming Fees:</span>
                    <span className="font-bold text-emerald-400">$0.00 (Zero Per-Minute Charge)</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Voice Channel:</span>
                    <span className="font-bold text-sky-400">2-Way Human Voice (No AI)</span>
                  </div>
                </div>
              );
            })()}

            {/* Free International Rates List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">VoIP Destinations (All Free):</span>
                <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded">
                  $0.00 / min
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { flag: '🇺🇸', name: 'USA & Canada', rate: '$0.00 / Free' },
                  { flag: '🇬🇧', name: 'United Kingdom', rate: '$0.00 / Free' },
                  { flag: '🇮🇳', name: 'India', rate: '$0.00 / Free' },
                  { flag: '🇦🇺', name: 'Australia', rate: '$0.00 / Free' },
                  { flag: '🇪🇺', name: 'Europe EU', rate: '$0.00 / Free' },
                  { flag: '🌐', name: 'Worldwide', rate: '$0.00 / Free' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-200">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800">
                      <span>{item.flag}</span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-mono font-bold text-emerald-700 shrink-0 text-[11px] bg-white px-1.5 py-0.5 rounded border border-emerald-200/60 shadow-2xs">{item.rate}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* In-App Live Voice & Cellular Trunk Card */}
            <div className="mt-auto bg-blue-50/90 rounded-xl p-3 border border-blue-200 text-xs text-blue-950 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1 text-blue-900">
                  <Smartphone className="w-3.5 h-3.5 text-blue-700" />
                  <span>In-App Live Voice Trunk</span>
                </span>
                <span className="text-[10px] bg-blue-200/80 font-bold px-1.5 py-0.5 rounded text-blue-800">
                  {selectedSimTrunk === 'in_app' ? 'In-App Voice' : selectedSimTrunk === 'sim2' ? 'SIM 2 (eSIM)' : 'SIM 1 (VoLTE)'}
                </span>
              </div>
              <p className="text-[11px] text-blue-800 leading-tight">
                Connects live 100% inside RoboVoiceCall with built-in WebRTC call handling and real-time voice audio.
              </p>
              <button
                type="button"
                onClick={() => handleConnectInAppCall(targetNumber)}
                className="w-full py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs text-center flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5 fill-current" />
                <span>Connect Live Call Inside App</span>
              </button>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 text-xs text-slate-600 flex flex-col gap-1.5">
              <span className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">Line Diagnostics</span>
              <div className="flex justify-between">
                <span>VoIP Protocol:</span>
                <span className="font-mono font-bold text-emerald-700">WebRTC Direct VoIP</span>
              </div>
              <div className="flex justify-between">
                <span>Audio Codec:</span>
                <span className="font-mono font-medium text-slate-800">Opus HD (48 kHz)</span>
              </div>
              <div className="flex justify-between">
                <span>Mode:</span>
                <span className="font-mono font-bold text-emerald-700">Pure Human Line (0% AI)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inbound Ringing Screen (In-App Full-Screen Caller ID) */}
      {sessionState === 'inbound_ringing' && (
        <div className="w-full bg-[#0052CC] text-white rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center justify-center min-h-[460px] relative overflow-hidden animate-fade-in border-4 border-blue-400/40">
          <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold text-white tracking-wider uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-200" />
            <span>Verified In-App Caller ID</span>
          </div>

          <div className="w-24 h-24 rounded-full bg-white text-[#0052CC] border-4 border-white/80 flex items-center justify-center mb-4 text-3xl font-extrabold shadow-2xl relative mt-6">
            {targetName ? targetName.charAt(0).toUpperCase() : 'U'}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white shadow">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-200 mb-1">
            Incoming WebRTC VoIP Call
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-1 flex items-center gap-2 text-center">
            <span>{targetName || 'Verified In-App Caller'}</span>
            <CheckCircle2 className="w-5 h-5 text-blue-200 shrink-0" />
          </h2>
          <span className="text-sm font-mono text-blue-100 mb-2">
            {targetNumber || 'Unknown'}
          </span>
          
          {(() => {
            const meta = getCallerIdMeta(targetNumber, targetName);
            return (
              <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs text-white mb-4">
                <span>{meta.operator}</span>
                <span>•</span>
                <span>{meta.location}</span>
                <span>•</span>
                <span className="text-emerald-300 font-bold">🟢 Safe (0% Spam)</span>
              </div>
            );
          })()}

          {callReason && (
            <div className="mb-6 px-4 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs shadow-md flex items-center gap-2">
              <span>{callReason}</span>
            </div>
          )}

          <div className="flex items-center gap-12 mt-2">
            <button
              type="button"
              onClick={handleDeclineInbound}
              className="flex flex-col items-center gap-2 text-blue-100 hover:text-white transition group cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-xl transition active:scale-95">
                <PhoneOff className="w-7 h-7" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">Decline</span>
            </button>

            <button
              type="button"
              onClick={handleAnswerInbound}
              className="flex flex-col items-center gap-2 text-blue-100 hover:text-white transition group cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-xl transition active:scale-95 animate-bounce">
                <Phone className="w-7 h-7 fill-current" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">Answer (WebRTC)</span>
            </button>
          </div>
        </div>
      )}

      {/* 100% In-App Live Call Screen */}
      {(sessionState === 'connected' || sessionState === 'dialing' || sessionState === 'ringing' || sessionState === 'hold') && (
        <div className="w-full min-h-[660px] sm:min-h-[720px] bg-[#141720] text-white rounded-2xl p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden select-none font-sans border border-slate-800 animate-fade-in">
          {/* Top Real WebRTC Signaling & ICE Status Bar */}
          <div className="w-full flex items-center justify-between text-xs text-slate-300 font-mono pt-1 px-1">
            <span className="font-semibold tracking-wider text-slate-200">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-300 font-semibold">
                {callingEngine.toUpperCase()} • ICE: {iceStatusLabel}
              </span>
              {myNumber && (
                <span className="text-slate-400">From: {myNumber}</span>
              )}
            </div>
          </div>

          {/* Automatic Numbers Calling Loop Status Badge */}
          {isAutoCallingActive && (
            <div className="w-full mt-2 bg-emerald-950/90 border border-emerald-500/60 rounded-xl p-3 flex items-center justify-between text-xs shadow-xl animate-fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <span className="font-extrabold text-emerald-300 block text-xs truncate">
                    Automatic Calling: Number {autoCallIndex + 1} of {autoCallQueue.length}
                  </span>
                  <span className="text-[10px] text-slate-300 block truncate">
                    {autoCallCountdown !== null 
                      ? `⏳ Pausing ${autoCallCountdown}s before next number...` 
                      : `Dialing in phone & calling automatically • ${autoCallQueue.length - autoCallIndex - 1} remaining`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleSkipToNextAutoCall}
                  className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1"
                  title="Finish and auto-dial next number"
                >
                  <span>Next ⏭</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopAutoCallingLoop}
                  className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[10px] shadow-sm transition active:scale-95 cursor-pointer"
                  title="Stop automatic numbers calling loop"
                >
                  <span>Stop ⏹</span>
                </button>
              </div>
            </div>
          )}

          {/* Contact Header Section */}
          <div className="flex flex-col items-center justify-center text-center mt-6 sm:mt-8">
            <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-500/25 border border-blue-400/50 text-blue-200 text-xs font-bold mb-2 shadow-sm">
              <span className={`w-2 h-2 rounded-full ${sessionState === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'}`} />
              <span>
                {sessionState === 'connected' 
                  ? 'Original Voice • 2-Way Connected 🟢' 
                  : sessionState === 'ringing'
                    ? 'Ringing Remote Peer...'
                    : 'Opening Hardware Mic & Signaling...'}
              </span>
            </div>

            <span className="text-sm sm:text-base font-normal text-slate-300 tracking-wide">
              {sessionState === 'hold'
                ? 'On hold'
                : sessionState === 'connected'
                  ? `Connected (${callingEngine.toUpperCase()}) • ${formatTime(callDuration)}`
                  : sessionState === 'ringing'
                    ? 'Waiting for recipient to answer...'
                    : 'Establishing connection...'}
            </span>

            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mt-2 sm:mt-3">
              {targetName || targetNumber || 'Phone Call'}
            </h1>

            {targetNumber && (
              <p className="text-base sm:text-lg font-medium text-slate-300 mt-1">
                Mobile {targetNumber}
              </p>
            )}
          </div>

          {/* 16-Lobed Scalloped Rosette Flower Avatar (Exact Material You rosette from screenshot) */}
          <div className="flex flex-col items-center justify-center my-auto py-4">
            <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center">
              <svg viewBox="0 0 180 180" className="w-full h-full drop-shadow-2xl">
                <path
                  d={getScallopedRosettePath(90, 90, 72, 7, 16)}
                  fill="#8d134a"
                />
                <text
                  x="90"
                  y="114"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="72"
                  fontWeight="600"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {targetName ? targetName.charAt(0).toUpperCase() : (targetNumber ? targetNumber.charAt(0) : '📞')}
                </text>
              </svg>
            </div>
            {/* Live Audio Activity Visualizer Waveform */}
            <canvas
              ref={canvasRef}
              width={260}
              height={32}
              className="mt-2 opacity-90 rounded-full"
            />
          </div>

          {/* In-Call Keypad Overlay when Keypad is active */}
          {showKeypad && (
            <div className="absolute inset-x-4 top-24 bottom-48 bg-[#1a1e29]/95 backdrop-blur-md rounded-3xl p-4 border border-slate-700/80 z-20 flex flex-col justify-between shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Dialpad</span>
                <button
                  type="button"
                  onClick={() => setShowKeypad(false)}
                  className="text-xs text-sky-400 hover:text-white font-bold"
                >
                  Hide Keypad
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 my-auto">
                {DIALPAD_KEYS.map((k) => (
                  <button
                    key={k.num}
                    type="button"
                    onClick={() => {
                      try {
                        playDtmfTone(k.num);
                      } catch {}
                    }}
                    className="py-3 rounded-2xl bg-[#262c3b] hover:bg-[#32394c] text-white flex flex-col items-center justify-center active:scale-95 transition cursor-pointer"
                  >
                    <span className="text-xl font-bold font-mono">{k.num}</span>
                    <span className="text-[9px] text-slate-400">{k.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* More Options Modal when More is active */}
          {showMoreMenu && (
            <div className="absolute inset-x-6 bottom-48 bg-[#1f2430] border border-slate-700 rounded-2xl p-3 shadow-2xl z-20 flex flex-col gap-2 animate-fade-in text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="font-bold text-slate-200">Call Options</span>
                <button onClick={() => setShowMoreMenu(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsRecording(!isRecording);
                  setShowMoreMenu(false);
                }}
                className="p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-left flex items-center justify-between"
              >
                <span>Record Call (HD Audio)</span>
                <span className={`text-[10px] font-bold ${isRecording ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {isRecording ? 'RECORDING' : 'OFF'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOnHold(!isOnHold);
                  setSessionState(isOnHold ? 'connected' : 'hold');
                  setShowMoreMenu(false);
                }}
                className="p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-left flex items-center justify-between"
              >
                <span>Hold Call</span>
                <span className="text-[10px] font-bold text-amber-400">
                  {isOnHold ? 'RESUME' : 'HOLD'}
                </span>
              </button>
            </div>
          )}

          {/* Bottom Floating In-Call Card (Exact match to screenshot dock) */}
          <div className="w-full max-w-sm mx-auto bg-[#1f2430] border border-[#2b3140] rounded-[32px] p-5 sm:p-6 shadow-2xl flex flex-col gap-5">
            {/* 4 Circular Action Buttons: Keypad, Mute, Speaker, More */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* Button 1: Keypad */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setShowKeypad(!showKeypad)}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md ${
                    showKeypad ? 'bg-white text-slate-950' : 'bg-[#2b3140] hover:bg-[#373e52] text-white'
                  }`}
                  title="Keypad"
                >
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <circle cx="5" cy="5" r="2" />
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="19" cy="5" r="2" />
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                    <circle cx="5" cy="19" r="2" />
                    <circle cx="12" cy="19" r="2" />
                    <circle cx="19" cy="19" r="2" />
                  </svg>
                </button>
                <span className="text-xs text-slate-300 font-medium mt-1.5">Keypad</span>
              </div>

              {/* Button 2: Mute */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsMuted(!isMuted);
                    if (!isMuted) {
                      stopRealMicrophone();
                    } else {
                      startRealMicrophone();
                    }
                  }}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md ${
                    isMuted ? 'bg-white text-slate-950' : 'bg-[#2b3140] hover:bg-[#373e52] text-white'
                  }`}
                  title="Mute"
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <span className="text-xs text-slate-300 font-medium mt-1.5">Mute</span>
              </div>

              {/* Button 3: Speaker */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => {
                    const newVol = volume > 50 ? 25 : 100;
                    setVolume(newVol);
                    setMasterAudioVolume(newVol / 100);
                  }}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md ${
                    volume > 50 ? 'bg-white text-slate-950' : 'bg-[#2b3140] hover:bg-[#373e52] text-white'
                  }`}
                  title="Speaker"
                >
                  {volume > 50 ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </button>
                <span className="text-xs text-slate-300 font-medium mt-1.5">Speaker</span>
              </div>

              {/* Button 4: More */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md ${
                    showMoreMenu ? 'bg-white text-slate-950' : 'bg-[#2b3140] hover:bg-[#373e52] text-white'
                  }`}
                  title="More options"
                >
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
                <span className="text-xs text-slate-300 font-medium mt-1.5">More</span>
              </div>
            </div>

            {/* Wide Coral-Red Rounded Pill End Call Button */}
            <button
              type="button"
              onClick={handleEndCall}
              className="w-36 sm:w-44 h-14 sm:h-16 mx-auto rounded-full bg-[#f26b5b] hover:bg-[#ea4335] text-slate-950 flex items-center justify-center shadow-lg active:scale-95 transition cursor-pointer mt-1"
              title="End Call"
            >
              <Phone className="w-7 h-7 text-slate-950 fill-current rotate-[135deg]" />
            </button>
          </div>

          {/* Bottom 3-Button Android Navigation Bar */}
          <div className="w-full flex items-center justify-around text-slate-500 pt-3 pb-1 select-none">
            <span className="text-sm font-light tracking-tighter">|||</span>
            <div className="w-3.5 h-3.5 border border-slate-500 rounded-sm" />
            <span className="text-sm font-light">‹</span>
          </div>
        </div>
      )}

      {/* Call Ended Summary Modal */}
      {sessionState === 'ended' && lastFinishedCall && (
        <div className="w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-xl flex flex-col gap-5 animate-fade-in">
          {isAutoCallingActive && autoCallCountdown !== null && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white border border-emerald-500/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <div>
                  <span className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider block">
                    Auto-Calling Queue Active ({autoCallIndex + 1} of {autoCallQueue.length} Done)
                  </span>
                  <span className="text-sm font-bold text-white block">
                    Dialing {autoCallQueue[autoCallIndex + 1]?.name || 'next number'} ({autoCallQueue[autoCallIndex + 1]?.phone}) in{' '}
                    <span className="font-mono text-emerald-400">{autoCallCountdown}s</span>...
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSkipToNextAutoCall}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-sm cursor-pointer"
                >
                  Dial Next Now
                </button>
                <button
                  type="button"
                  onClick={handleStopAutoCallingLoop}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-sm cursor-pointer"
                >
                  Stop Auto-Calling
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Live Call Completed Successfully
                </h2>
                <span className="text-xs text-slate-500">
                  Logged in Call History • Attestation Level A
                </span>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs">
              Sentiment: {lastFinishedCall.sentiment.toUpperCase()}
            </span>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Duration</span>
              <span className="text-base font-bold font-mono text-slate-900">{formatTime(lastFinishedCall.durationSeconds)}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Recipient</span>
              <span className="text-base font-bold text-slate-900 truncate block">{lastFinishedCall.callerName}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Voice Line</span>
              <span className="text-base font-bold text-slate-900 truncate block">{lastFinishedCall.agentName}</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">VoIP Rate & Cost</span>
              <span className="text-base font-bold font-mono text-emerald-700">FREE ($0.00)</span>
            </div>
          </div>

          {/* Transcript Snippet */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80 max-h-48 overflow-y-auto flex flex-col gap-2">
            <span className="text-xs font-bold text-slate-700 mb-1">Session Transcript ({lastFinishedCall.transcript.length} turns):</span>
            {lastFinishedCall.transcript.map((t, idx) => (
              <div key={idx} className="text-xs text-slate-800">
                <strong className={t.sender === 'agent' ? 'text-emerald-700' : 'text-slate-900'}>
                  {t.sender === 'agent' ? lastFinishedCall.agentName : 'Caller'}:
                </strong>{' '}
                {t.text}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              onClick={onNavigateHistory}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition"
            >
              View in Call History
            </button>

            <button
              onClick={() => {
                if (isAutoCallingActiveRef.current) {
                  handleStopAutoCallingLoop();
                  return;
                }
                setSessionState('idle');
                setTranscript([]);
                setCallDuration(0);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isAutoCallingActive ? 'Stop & Return to Queue' : 'Start Another Live Call'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Schedule Toast Notification */}
      {scheduleToast && (
        <div className="fixed top-5 right-5 z-50 animate-bounce">
          <div className={`px-4 py-3 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 border ${
            scheduleToast.type === 'error'
              ? 'bg-red-600 text-white border-red-700'
              : scheduleToast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-amber-500 text-slate-950 border-amber-600'
          }`}>
            <Bell className="w-4 h-4 animate-pulse shrink-0" />
            <span>{scheduleToast.text}</span>
          </div>
        </div>
      )}

      {/* Modal 1: Schedule Number Dialing Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-100 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Call Scheduler & Auto-Dialer</span>
                </span>
                <h3 className="text-base font-extrabold text-white">
                  Schedule Number Dialing
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-1 rounded-lg text-amber-100 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-4 sm:p-5 flex flex-col gap-3.5 max-h-[80vh] overflow-y-auto">
              {/* Recipient Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="Enter name..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={targetNumber}
                    onChange={(e) => setTargetNumber(e.target.value)}
                    placeholder="Enter phone number..."
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Date & Time Selectors */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 flex flex-col gap-2.5">
                <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>Scheduled Date & Time</span>
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Date</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-semibold mr-1">Quick:</span>
                  <button
                    type="button"
                    onClick={() => applyQuickPreset(5)}
                    className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold shadow-2xs transition"
                  >
                    +5 Mins
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickPreset(15)}
                    className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold shadow-2xs transition"
                  >
                    +15 Mins
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickPreset(30)}
                    className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold shadow-2xs transition"
                  >
                    +30 Mins
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickPreset(60)}
                    className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold shadow-2xs transition"
                  >
                    +1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={applyTomorrowMorning}
                    className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold shadow-2xs transition"
                  >
                    Tomorrow 10 AM
                  </button>
                </div>
              </div>

              {/* Agent Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Assigned AI Voice Agent
                </label>
                <select
                  value={scheduleAgentId}
                  onChange={(e) => setScheduleAgentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} — {agent.role} ({agent.voiceGender})
                    </option>
                  ))}
                </select>
              </div>

              {/* Call Reason / Context */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Call Purpose / Reason
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '⚡ Urgent Call',
                    '💼 Business Inquiry',
                    '📦 Order & Delivery',
                    '🤝 Meeting Follow-up',
                    '📅 Appointment'
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCallReason(r)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                        callReason === r
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scheduled Reminder Option */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-slate-900 block">
                    Scheduled Call Reminder (Manual Control)
                  </span>
                  <span className="text-[10px] text-slate-600 block">
                    Prepares number and notifies you with 1-tap "Dial Now". Never auto-dials without your click.
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveScheduledCall}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Confirm & Arm Schedule</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Scheduled Number Dialing Queue Drawer */}
      {showScheduledListDrawer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[85vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-100" />
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Scheduled Calls Queue
                  </h3>
                  <span className="text-[11px] text-amber-100">
                    {pendingScheduledCalls.length} active scheduled • {scheduledCalls.length} total
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduledListDrawer(false)}
                className="p-1 rounded-lg text-amber-100 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List Body */}
            <div className="p-4 flex flex-col gap-2.5 overflow-y-auto flex-1">
              {scheduledCalls.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Calendar className="w-10 h-10 text-slate-300" />
                  <p className="text-xs font-semibold">No calls currently scheduled.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScheduledListDrawer(false);
                      setShowScheduleModal(true);
                    }}
                    className="mt-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm"
                  >
                    + Schedule Number Dialing
                  </button>
                </div>
              ) : (
                scheduledCalls.map((item) => {
                  const isPending = item.status === 'pending';
                  const countdown = getCountdownText(item.scheduledDate, item.scheduledTime);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition flex flex-col gap-2 ${
                        isPending
                          ? 'border-amber-200 bg-amber-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-blue-600">
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-xs text-slate-900 block truncate">{item.name}</span>
                            <span className="text-[10px] font-mono text-slate-600 block">{item.phone}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            WebRTC HD
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPending ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {isPending ? countdown : 'Completed'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <span>📅 {item.scheduledDate} at {item.scheduledTime}</span>
                          {item.callReason && <span>• {item.callReason}</span>}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowScheduledListDrawer(false);
                                setTargetName(item.name);
                                setTargetNumber(item.phone);
                                setCallReason(item.callReason);
                                if (item.agentId) onSelectAgent(item.agentId);
                                handleInitiateLiveCall();
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition active:scale-95"
                            >
                              Dial Now
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteScheduledCall(item.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                            title="Delete this schedule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduledListDrawer(false);
                    setShowScheduleModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition"
                >
                  + Add Another
                </button>
                {scheduledCalls.some(s => s.status !== 'pending') && (
                  <button
                    type="button"
                    onClick={handleClearFinishedScheduledCalls}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:text-slate-900 text-xs font-medium"
                  >
                    Clear Finished
                  </button>
                )}
              </div>

              {onNavigateSchedule && (
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduledListDrawer(false);
                    onNavigateSchedule();
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <span>Open Full Bulk Campaign</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remote WebRTC Audio Stream Sink (<audio id="remoteAudio" autoplay playsinline>) */}
      <audio id="remoteAudio" autoPlay playsInline className="hidden" />

      {/* WebRTC Diagnostics & Connectivity Inspector Modal */}
      <WebRTCDiagnosticsModal
        isOpen={showWebRTCDiagnostics}
        onClose={() => setShowWebRTCDiagnostics(false)}
      />

      {/* Agora SD-RTN™ Voice Settings & Inspector Modal */}
      <AgoraSettingsModal
        isOpen={showAgoraSettings}
        onClose={() => setShowAgoraSettings(false)}
        currentEngine={callingEngine}
        onEngineSelect={(engine) => {
          setCallingEngine(engine);
          try {
            localStorage.setItem('applet_calling_engine', engine);
          } catch {}
        }}
      />

      {/* Vonage Voice API Settings & Inspector Modal */}
      <VonageSettingsModal
        isOpen={showVonageSettings}
        onClose={() => setShowVonageSettings(false)}
        currentEngine={callingEngine}
        onEngineSelect={(engine) => {
          setCallingEngine(engine);
          try {
            localStorage.setItem('applet_calling_engine', engine);
          } catch {}
        }}
      />

      {/* MobileVOIP In-Place Permissions Modal */}
      {showPermissionsModal && (
        <PermissionsView
          isModal={true}
          onBack={() => setShowPermissionsModal(false)}
          onComplete={() => {
            setShowPermissionsModal(false);
            setIsPermissionsGranted(true);
            startRealMicrophone();
          }}
        />
      )}
    </div>
  );
};
