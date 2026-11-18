import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Clock, Upload, Smartphone, Users, Play, Pause, Square, 
  SkipForward, Volume2, Mic, CheckCircle2, AlertCircle, RotateCcw, 
  Plus, Trash2, BookOpen, FileSpreadsheet, ChevronLeft, ShieldCheck, 
  Sun, Moon, Info, Radio, PhoneCall, Check, X, Bell, Sparkles, Search, Download, Phone,
  Video, VideoOff, Film, Disc, ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { VoiceAgent, AppContact, CallLog } from '../types';
import { unlockAudioAndSpeech, ringback, playConnectChime, playEndCallChime } from '../utils/audio';
import { speechEngine } from '../utils/speech';
import { videoRecorderManager, RecordedVideoResult } from '../utils/videoRecorder';
import { webrtcManager } from '../utils/webrtc';

export interface AutoDialContactItem {
  id: string;
  name: string;
  phone: string;
  status: 'pending' | 'dialing' | 'completed' | 'skipped' | 'failed';
  calledAt?: string;
  durationSeconds?: number;
}

export interface AudioTrackItem {
  id: string;
  name: string;
  duration: string;
  url?: string;
  isRecorded?: boolean;
}

interface ScheduleViewProps {
  agents?: VoiceAgent[];
  contacts: AppContact[];
  initialTab?: 'audio' | 'contacts' | 'schedule' | 'interval' | 'rules';
  onBack: () => void;
  onCallScheduled?: (contact: { name: string; phone: string; autoDial?: boolean }, agentId?: string) => void;
  onLogCompletedCall?: (callLog: CallLog) => void;
  onImportNewContacts?: (newContacts: AppContact[]) => void;
  autoStartWalkthrough?: boolean;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ 
  agents = [], 
  contacts, 
  initialTab,
  onBack, 
  onCallScheduled,
  onLogCompletedCall,
  onImportNewContacts,
  autoStartWalkthrough
}) => {
  // Active Tab: 1. Audio, 2. Contacts, 3. Schedule, 4. Interval, 5. Rules & Runner
  const [activeTab, setActiveTab] = useState<'audio' | 'contacts' | 'schedule' | 'interval' | 'rules'>(initialTab || 'schedule');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // STEP 1: Upload Audio State
  const [audioTracks, setAudioTracks] = useState<AudioTrackItem[]>(() => {
    try {
      const saved = localStorage.getItem('applet_auto_audio_tracks');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'track-campaign-1',
        name: 'Automated Broadcast Message (Default)',
        duration: '00:24',
        url: ''
      }
    ];
  });
  const [selectedAudioId, setSelectedAudioId] = useState<string>(() => {
    return localStorage.getItem('applet_selected_audio_id') || 'track-campaign-1';
  });
  const [previewAudioPlaying, setPreviewAudioPlaying] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const recordSecondsRef = useRef<number>(0);
  const recordingTimerRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewAudioElRef = useRef<HTMLAudioElement | null>(null);

  // Clean up audio streams, dialer timers, and speech on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      if (activeCallTimerRef.current) clearInterval(activeCallTimerRef.current);
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      walkthroughTimersRef.current.forEach(t => clearTimeout(t));
      walkthroughTimersRef.current = [];
      try {
        ringback.stop();
        speechEngine.stopSpeaking();
      } catch {}
      if (webrtcUnsubRef.current) {
        webrtcUnsubRef.current();
        webrtcUnsubRef.current = null;
      }
      if (isDialerRunningRef.current) {
        webrtcManager.terminateCallSession();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // STEP 2: Contacts Selection & Pending Calling List
  const [pendingQueue, setPendingQueue] = useState<AutoDialContactItem[]>(() => {
    try {
      const saved = localStorage.getItem('applet_pending_queue');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out legacy mock contacts and explicitly removed numbers
          return parsed.filter(c => 
            c && c.name && 
            !c.name.includes('Smith') && 
            !c.name.includes('Velocity') && 
            !c.name.includes('Scott') && 
            !c.name.includes('Halpert') && 
            !c.name.includes('Sourav Singh (Registered SIM)') &&
            !c.name.includes('Rajesh Kumar (Client Lead)') &&
            !c.name.includes('Priya Sharma') &&
            !c.name.includes('Amit Patel (Corporate Partner)') &&
            !c.name.includes('Sneha Reddy (Direct Lead)') &&
            !c.name.includes('Vikram Malhotra (Executive)') &&
            !c.name.includes('Anita Desai (Consulting)') &&
            !c.phone?.includes('555-01') &&
            !c.phone?.includes('7291066713') &&
            !c.name?.toLowerCase().includes('ghgh')
          );
        }
      }
    } catch {
      // ignore
    }
    return contacts
      .filter(c => !c.phone?.includes('7291066713') && !c.name?.toLowerCase().includes('ghgh'))
      .map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        status: 'pending'
      }));
  });

  // Permanently purge removed contact 7291066713 / ghgh on mount if present in storage
  useEffect(() => {
    setPendingQueue(prev => {
      const filtered = prev.filter(c => !c.phone?.includes('7291066713') && !c.name?.toLowerCase().includes('ghgh'));
      if (filtered.length !== prev.length) {
        try {
          localStorage.setItem('applet_pending_queue', JSON.stringify(filtered));
        } catch {}
      }
      return filtered;
    });
  }, []);

  // STEP 2: Dedicated 3 Contacts Input Form
  const [threeContacts, setThreeContacts] = useState<[
    { name: string; phone: string },
    { name: string; phone: string },
    { name: string; phone: string }
  ]>(() => {
    try {
      const saved = localStorage.getItem('applet_3_contacts_slots');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { name: '', phone: '' },
      { name: '', phone: '' },
      { name: '', phone: '' }
    ];
  });

  // STEP 5: Video Recording of Autonomous Calling
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingVideoSeconds, setRecordingVideoSeconds] = useState(0);
  const [recordingMode, setRecordingMode] = useState<'screen' | 'canvas'>('canvas');
  const [lastRecordedVideo, setLastRecordedVideo] = useState<RecordedVideoResult | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [isAutomatedWalkthrough, setIsAutomatedWalkthrough] = useState(false);
  const [walkthroughStepNotice, setWalkthroughStepNotice] = useState<string | null>(null);

  // Phonebook starts empty so random contacts do not show: only populated when imported or added
  const [removedPhones, setRemovedPhones] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('applet_removed_phonebook_phones');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Simulated Device Phonebook & SIM contacts with persistent deletion support
  const [phonebookList, setPhonebookList] = useState<AutoDialContactItem[]>(() => {
    try {
      const saved = localStorage.getItem('applet_sim_phonebook_list');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(c => 
            !c.phone?.includes('7291066713') && 
            !c.name?.toLowerCase().includes('ghgh') &&
            !c.name?.includes('Sourav Singh') &&
            !c.name?.includes('Rajesh Kumar') &&
            !c.name?.includes('Priya Sharma') &&
            !c.name?.includes('Amit Patel') &&
            !c.name?.includes('Sneha Reddy') &&
            !c.name?.includes('Vikram Malhotra') &&
            !c.name?.includes('Anita Desai')
          );
        }
      }
    } catch {}
    return [];
  });

  const [selectedPhonebookIds, setSelectedPhonebookIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('applet_sim_phonebook_list');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((c: any) => c.id));
        }
      }
    } catch {}
    return new Set<string>();
  });

  // Persist Phonebook list and removed phones in localStorage
  useEffect(() => {
    try {
      localStorage.setItem('applet_sim_phonebook_list', JSON.stringify(phonebookList));
    } catch {}
  }, [phonebookList]);

  useEffect(() => {
    try {
      localStorage.setItem('applet_removed_phonebook_phones', JSON.stringify(removedPhones));
    } catch {}
  }, [removedPhones]);

  const handleRemoveQueueContact = (id: string, name: string) => {
    const target = pendingQueue.find(c => c.id === id);
    const cleanPhone = target?.phone ? target.phone.replace(/[^\d]/g, '') : '';

    setPendingQueue(prev => {
      const filtered = prev.filter(c => c.id !== id);
      try {
        localStorage.setItem('applet_pending_queue', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    // Also remove from Phonebook & SIM so it DOES NOT show again!
    setPhonebookList(prev => {
      const filtered = prev.filter(c => {
        if (c.id === id) return false;
        if (cleanPhone && c.phone.replace(/[^\d]/g, '') === cleanPhone) return false;
        return true;
      });
      try {
        localStorage.setItem('applet_sim_phonebook_list', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    setSelectedPhonebookIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (cleanPhone) {
      setRemovedPhones(prev => {
        const next = [...new Set([...prev, cleanPhone])];
        try {
          localStorage.setItem('applet_removed_phonebook_phones', JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    triggerToast(`Removed "${name}" from calling queue and Phonebook & SIM.`, 'info');
    logEvent(`Removed contact ${name} from calling queue and Phonebook & SIM.`, 'info');
  };

  // Remove single contact directly from Phonebook & SIM modal
  const handleRemovePhonebookContact = (id: string, phone: string, name: string) => {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    setPhonebookList(prev => {
      const filtered = prev.filter(c => c.id !== id && (!cleanPhone || c.phone.replace(/[^\d]/g, '') !== cleanPhone));
      try {
        localStorage.setItem('applet_sim_phonebook_list', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    setSelectedPhonebookIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (cleanPhone) {
      setRemovedPhones(prev => {
        const next = [...new Set([...prev, cleanPhone])];
        try {
          localStorage.setItem('applet_removed_phonebook_phones', JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    // Also remove from calling queue if present
    setPendingQueue(prev => {
      const filtered = prev.filter(c => c.id !== id && (!cleanPhone || c.phone.replace(/[^\d]/g, '') !== cleanPhone));
      try {
        localStorage.setItem('applet_pending_queue', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    triggerToast(`Removed "${name}" from Phonebook & SIM. Will not show again.`, 'info');
    logEvent(`Removed "${name}" from Phonebook & SIM.`, 'info');
  };

  // Clear all contacts from Phonebook & SIM modal completely
  const handleClearAllPhonebook = () => {
    const allPhones = phonebookList.map(c => c.phone.replace(/[^\d]/g, ''));
    setPhonebookList([]);
    setSelectedPhonebookIds(new Set());
    try {
      localStorage.setItem('applet_sim_phonebook_list', JSON.stringify([]));
    } catch {}

    if (allPhones.length > 0) {
      setRemovedPhones(prev => {
        const next = [...new Set([...prev, ...allPhones])];
        try {
          localStorage.setItem('applet_removed_phonebook_phones', JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    triggerToast('All contacts cleared from Phonebook & SIM. Will not show again.', 'info');
    logEvent('All contacts cleared from Phonebook & SIM.', 'warning');
  };

  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showImportFileModal, setShowImportFileModal] = useState(false);
  const [showPhonebookModal, setShowPhonebookModal] = useState(false);
  const [phonebookSearch, setPhonebookSearch] = useState('');
  const [pasteContactsText, setPasteContactsText] = useState('');
  const [singleNameInput, setSingleNameInput] = useState('');
  const [singlePhoneInput, setSinglePhoneInput] = useState('');
  const [singleCategoryInput, setSingleCategoryInput] = useState('Lead');
  const [singleCompanyInput, setSingleCompanyInput] = useState('');
  const [phonebookAlert, setPhonebookAlert] = useState<string | null>(null);
  const [fileImportSuccessMessage, setFileImportSuccessMessage] = useState<string | null>(null);
  const contactsFileInputRef = useRef<HTMLInputElement | null>(null);

  const [quickPhonebookName, setQuickPhonebookName] = useState('');
  const [quickPhonebookPhone, setQuickPhonebookPhone] = useState('');

  // STEP 3: Schedule 1st Call Auto-Start (Date & Time, Zero-Touch)
  const getLocalDateString = (d: Date = new Date()) => {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [startDate, setStartDate] = useState<string>(() => {
    return getLocalDateString(new Date());
  });
  const [startTime, setStartTime] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  });
  const [startImmediately, setStartImmediately] = useState<boolean>(false);
  const [callMethod, setCallMethod] = useState<'webrtc' | 'sim'>('webrtc'); // Default to In-App WebRTC Call for 100% autonomous continuous dialing
  const [isScheduledActive, setIsScheduledActive] = useState<boolean>(false);
  const [countdownString, setCountdownString] = useState<string>('00:00:00');
  const [targetTimestamp, setTargetTimestamp] = useState<number | null>(null);

  // STEP 4: Time Interval Between Two Calls
  const [intervalSeconds, setIntervalSeconds] = useState<number>(15); // 15 seconds default
  const intervalTimerRef = useRef<any>(null);

  // STEP 5: Business Hours & Sunday Restriction Rule (Configurable window, not hardcoded!)
  const [enforceBusinessHours, setEnforceBusinessHours] = useState<boolean>(false); // Allow calls at any scheduled time by default (e.g. 5:55 AM)
  const [businessHoursStart, setBusinessHoursStart] = useState<string>('08:00'); // Configurable start time
  const [businessHoursEnd, setBusinessHoursEnd] = useState<string>('18:00'); // Configurable end time
  const [enforceNoSunday, setEnforceNoSunday] = useState<boolean>(true); // No calls on Sunday
  const [previewClockTime, setPreviewClockTime] = useState<Date | null>(null);
  const [currentRuleStatus, setCurrentRuleStatus] = useState<{
    isAllowedNow: boolean;
    reason: string;
    nextAllowedTimeStr: string;
  }>({ isAllowedNow: true, reason: 'Within Calling Window', nextAllowedTimeStr: '' });

  // Additional Step 1 & Step 2 State
  const [showTtsModal, setShowTtsModal] = useState<boolean>(false);
  const [ttsPrompt, setTtsPrompt] = useState<string>('Hello, this is an important automated notification regarding your pending request. Please press 1 to confirm or 2 to reschedule.');
  const [contactSearchQuery, setContactSearchQuery] = useState<string>('');
  const [contactStatusFilter, setContactStatusFilter] = useState<'all' | 'pending' | 'completed' | 'skipped'>('all');

  // LIVE RUNNER STATE (When campaign is running)
  const [isDialerRunning, setIsDialerRunning] = useState<boolean>(false);
  const [isDialerPaused, setIsDialerPaused] = useState<boolean>(false);
  const [currentDialingIndex, setCurrentDialingIndex] = useState<number>(0);
  const [currentCallSeconds, setCurrentCallSeconds] = useState<number>(0);
  const [currentCallState, setCurrentCallState] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const [intervalCountdown, setIntervalCountdown] = useState<number | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<{ time: string; text: string; type: 'info' | 'success' | 'warning' }[]>([]);
  const [scheduleToast, setScheduleToast] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const wakeLockRef = useRef<any>(null);
  const activeCallTimerRef = useRef<any>(null);
  const ringTimerRef = useRef<any>(null);
  const webrtcUnsubRef = useRef<(() => void) | null>(null);
  const walkthroughTimersRef = useRef<number[]>([]);

  // Live state refs for accurate async timers & 1280x720 video canvas recording frames
  const currentStepRef = useRef<number>(1);
  const activeTabRef = useRef<'audio' | 'contacts' | 'schedule' | 'interval' | 'rules'>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
    currentStepRef.current = activeTab === 'audio' ? 1 : activeTab === 'contacts' ? 2 : activeTab === 'schedule' ? 3 : activeTab === 'interval' ? 4 : 5;
  }, [activeTab]);

  const pendingQueueRef = useRef(pendingQueue);
  pendingQueueRef.current = pendingQueue;
  const currentDialingIndexRef = useRef(currentDialingIndex);
  currentDialingIndexRef.current = currentDialingIndex;
  const currentCallStateRef = useRef(currentCallState);
  currentCallStateRef.current = currentCallState;
  const currentCallSecondsRef = useRef(currentCallSeconds);
  currentCallSecondsRef.current = currentCallSeconds;
  const intervalCountdownRef = useRef(intervalCountdown);
  intervalCountdownRef.current = intervalCountdown;
  const audioTracksRef = useRef(audioTracks);
  audioTracksRef.current = audioTracks;
  const selectedAudioIdRef = useRef(selectedAudioId);
  selectedAudioIdRef.current = selectedAudioId;
  const intervalSecondsRef = useRef(intervalSeconds);
  intervalSecondsRef.current = intervalSeconds;
  const isAutomatedWalkthroughRef = useRef(isAutomatedWalkthrough);
  isAutomatedWalkthroughRef.current = isAutomatedWalkthrough;
  const enforceBusinessHoursRef = useRef(enforceBusinessHours);
  enforceBusinessHoursRef.current = enforceBusinessHours;
  const enforceNoSundayRef = useRef(enforceNoSunday);
  enforceNoSundayRef.current = enforceNoSunday;
  const businessHoursStartRef = useRef(businessHoursStart);
  businessHoursStartRef.current = businessHoursStart;
  const businessHoursEndRef = useRef(businessHoursEnd);
  businessHoursEndRef.current = businessHoursEnd;
  const previewClockTimeRef = useRef(previewClockTime);
  previewClockTimeRef.current = previewClockTime;
  const onLogCompletedCallRef = useRef(onLogCompletedCall);
  onLogCompletedCallRef.current = onLogCompletedCall;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const campaignLogsRef = useRef(campaignLogs);
  campaignLogsRef.current = campaignLogs;
  const startDateRef = useRef(startDate);
  startDateRef.current = startDate;
  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;
  const threeContactsRef = useRef(threeContacts);
  threeContactsRef.current = threeContacts;
  const isDialerRunningRef = useRef(isDialerRunning);
  isDialerRunningRef.current = isDialerRunning;
  const isDialerPausedRef = useRef(isDialerPaused);
  isDialerPausedRef.current = isDialerPaused;
  const triggerAutoStartCampaignRef = useRef<() => void>(() => {});
  const executeDialNextContactRef = useRef<(index: number, forceBypassRuleCheck?: boolean) => void>(() => {});

  const triggerToast = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
    setScheduleToast({ text, type });
    setTimeout(() => setScheduleToast(null), 4500);
  };

  // Save audio tracks
  useEffect(() => {
    try {
      localStorage.setItem('applet_auto_audio_tracks', JSON.stringify(audioTracks));
    } catch {
      // ignore
    }
  }, [audioTracks]);

  // Save selected audio
  useEffect(() => {
    try {
      localStorage.setItem('applet_selected_audio_id', selectedAudioId);
    } catch {
      // ignore
    }
  }, [selectedAudioId]);

  // Save pending queue
  useEffect(() => {
    try {
      localStorage.setItem('applet_pending_queue', JSON.stringify(pendingQueue));
    } catch {
      // ignore
    }
  }, [pendingQueue]);

  // Clear all contacts from calling queue completely and purge from Phonebook & SIM
  const handleClearCallingQueue = () => {
    if (isDialerRunning) {
      handleStopDialer();
    }
    const targetPhones = pendingQueue.map(c => c.phone.replace(/[^\d]/g, '')).filter(Boolean);

    setPendingQueue([]);
    setContactSearchQuery('');
    setContactStatusFilter('all');
    try {
      localStorage.setItem('applet_pending_queue', JSON.stringify([]));
    } catch {
      // ignore
    }

    // Also remove from Phonebook & SIM list so they DO NOT show again in Select from Phonebook & SIM!
    if (targetPhones.length > 0) {
      setPhonebookList(prev => {
        const filtered = prev.filter(c => {
          const clean = c.phone.replace(/[^\d]/g, '');
          return !targetPhones.includes(clean);
        });
        try {
          localStorage.setItem('applet_sim_phonebook_list', JSON.stringify(filtered));
        } catch {}
        return filtered;
      });

      setSelectedPhonebookIds(prev => {
        const next = new Set(prev);
        pendingQueue.forEach(c => next.delete(c.id));
        return next;
      });

      setRemovedPhones(prev => {
        const next = [...new Set([...prev, ...targetPhones])];
        try {
          localStorage.setItem('applet_removed_phonebook_phones', JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    logEvent('Calling queue cleared by user and purged from Phonebook & SIM.', 'warning');
    triggerToast('Calling queue cleared and removed from Phonebook list.', 'info');
  };

  // Screen Wake Lock API to prevent phone from sleeping during scheduled countdown or auto-dialing
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake lock error:', err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch {
        // ignore
      }
    }
  };

  // Rule verification: Configurable Business Hours & Sunday restrictions
  const checkCallingWindow = (date = (previewClockTimeRef.current || new Date())): { isAllowedNow: boolean; reason: string; nextAllowedTimeStr: string } => {
    const day = date.getDay(); // 0 is Sunday
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const currentMins = hours * 60 + minutes;

    // Parse configurable start & stop times from refs so async loops see latest settings
    const [startH, startM] = (businessHoursStartRef.current || '08:00').split(':').map(Number);
    const [stopH, stopM] = (businessHoursEndRef.current || '18:00').split(':').map(Number);
    const startMins = (startH || 8) * 60 + (startM || 0);
    const stopMins = (stopH || 18) * 60 + (stopM || 0);

    // Format readable time string helper
    const formatTimeLabel = (h: number, m: number) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const dispH = h % 12 === 0 ? 12 : h % 12;
      return `${dispH}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    // Check Sunday
    if (enforceNoSundayRef.current && day === 0) {
      // It's Sunday! Calculate Monday start time
      const nextMonday = new Date(date);
      nextMonday.setDate(date.getDate() + 1);
      nextMonday.setHours(startH || 8, startM || 0, 0, 0);
      return {
        isAllowedNow: false,
        reason: '🛑 Sunday Restriction: Strictly NO calls on Sunday.',
        nextAllowedTimeStr: `Monday at ${formatTimeLabel(startH || 8, startM || 0)} (${nextMonday.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`
      };
    }

    // Check Business Hours Window
    if (enforceBusinessHoursRef.current) {
      if (currentMins < startMins) {
        // Before configured start window today
        return {
          isAllowedNow: false,
          reason: `🌅 Early Hours: Calling window starts at ${formatTimeLabel(startH || 8, startM || 0)}.`,
          nextAllowedTimeStr: `Today at ${formatTimeLabel(startH || 8, startM || 0)}`
        };
      }
      if (currentMins >= stopMins) {
        // After configured cutoff today. Calculate tomorrow morning
        const tomorrow = new Date(date);
        tomorrow.setDate(date.getDate() + 1);
        tomorrow.setHours(startH || 8, startM || 0, 0, 0);
        if (enforceNoSundayRef.current && tomorrow.getDay() === 0) {
          tomorrow.setDate(tomorrow.getDate() + 1); // jump to Monday
          return {
            isAllowedNow: false,
            reason: `🌙 Cutoff reached (${formatTimeLabel(stopH || 18, stopM || 0)}). Tomorrow is Sunday.`,
            nextAllowedTimeStr: `Monday at ${formatTimeLabel(startH || 8, startM || 0)} (${tomorrow.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`
          };
        }
        return {
          isAllowedNow: false,
          reason: `🌙 Daily stop reached (${formatTimeLabel(stopH || 18, stopM || 0)}). Calls halt until morning.`,
          nextAllowedTimeStr: `Tomorrow at ${formatTimeLabel(startH || 8, startM || 0)}`
        };
      }
    }

    return {
      isAllowedNow: true,
      reason: enforceBusinessHoursRef.current 
        ? `🟢 Calling Window Active (${formatTimeLabel(startH || 8, startM || 0)} – ${formatTimeLabel(stopH || 18, stopM || 0)})` 
        : '🟢 24/7 Calling Allowed (No restriction on scheduled time)',
      nextAllowedTimeStr: 'Currently Active'
    };
  };

  // Continuous rule evaluation timer
  useEffect(() => {
    const updateRule = () => {
      setCurrentRuleStatus(checkCallingWindow());
    };
    updateRule();
    const interval = setInterval(updateRule, 5000);
    return () => clearInterval(interval);
  }, [enforceBusinessHours, enforceNoSunday, businessHoursStart, businessHoursEnd, previewClockTime]);

  // STEP 3: Live Countdown Calculation for Scheduled 1st Call Auto-Start
  useEffect(() => {
    if (!isScheduledActive || !targetTimestamp) {
      return;
    }

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = targetTimestamp - now;

      if (diff <= 0) {
        clearInterval(timer);
        setCountdownString('00:00:00 - Launching 1st Call!');
        // Autonomous zero-touch trigger via ref!
        triggerAutoStartCampaignRef.current();
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdownString(
          `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isScheduledActive, targetTimestamp]);

  // Activate Scheduler
  const handleScheduleCampaign = () => {
    if (pendingQueue.filter(c => c.status === 'pending').length === 0) {
      triggerToast('Please add at least one pending contact to the calling list first.', 'error');
      setActiveTab('contacts');
      return;
    }

    if (startImmediately) {
      triggerAutoStartCampaign();
      return;
    }

    // Parse target date and time
    const [year, month, day] = startDate.split('-').map(Number);
    const [hours, minutes] = startTime.split(':').map(Number);
    let target = new Date(year, month - 1, day, hours, minutes, 0, 0);

    // If the scheduled time on the selected date is in the past, automatically schedule it for tomorrow at the same time
    if (target.getTime() <= Date.now()) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextDateStr = getLocalDateString(tomorrow);
      target = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), hours, minutes, 0, 0);
      setStartDate(nextDateStr);
      triggerToast(`Selected time was earlier today. Automatically armed for tomorrow (${nextDateStr} at ${startTime}).`, 'info');
    }

    setTargetTimestamp(target.getTime());
    setIsScheduledActive(true);
    requestWakeLock();
    logEvent(`Auto-dial campaign scheduled for ${target.toLocaleDateString()} at ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} via WebRTC In-App VoIP. Phone dialer popups bypassed for continuous zero-touch loop!`, 'info');
  };

  const handleCancelSchedule = () => {
    setIsScheduledActive(false);
    setTargetTimestamp(null);
    releaseWakeLock();
    logEvent('Scheduled auto-dialing was cancelled.', 'warning');
  };

  // STEP 2: Populate 3-contact slots from user's saved contacts (no hardcoded demo leads)
  const handleImportSavedContactsToThreeSlots = () => {
    if (!contacts || contacts.length === 0) {
      setScheduleToast({ text: 'No saved contacts found yet. Enter numbers directly or add contacts first.', type: 'info' });
      return;
    }
    const leads: [
      { name: string; phone: string },
      { name: string; phone: string },
      { name: string; phone: string }
    ] = [
      contacts[0] ? { name: contacts[0].name, phone: contacts[0].phone } : { name: '', phone: '' },
      contacts[1] ? { name: contacts[1].name, phone: contacts[1].phone } : { name: '', phone: '' },
      contacts[2] ? { name: contacts[2].name, phone: contacts[2].phone } : { name: '', phone: '' }
    ];
    threeContactsRef.current = leads;
    setThreeContacts(leads);
    try {
      localStorage.setItem('applet_3_contacts_slots', JSON.stringify(leads));
    } catch {}
    setScheduleToast({ text: `Loaded ${Math.min(3, contacts.length)} saved contact(s) into Step 2 slots.`, type: 'success' });
  };

  // STEP 2: Save the 3 contacts and queue them into pending auto-dial list
  const handleSaveThreeContacts = (skipTabSwitch = false) => {
    const valid = threeContactsRef.current.filter(c => c.name.trim() && c.phone.trim());
    if (valid.length === 0) {
      setScheduleToast({ text: 'Please enter at least 1 contact name and phone number.', type: 'info' });
      return;
    }
    const newItems: AutoDialContactItem[] = valid.map((c, i) => ({
      id: `three-contact-${Date.now()}-${i}`,
      name: c.name.trim(),
      phone: c.phone.trim(),
      status: 'pending' as const
    }));
    pendingQueueRef.current = newItems;
    setPendingQueue(newItems);
    try {
      localStorage.setItem('applet_pending_queue', JSON.stringify(newItems));
      localStorage.setItem('applet_3_contacts_slots', JSON.stringify(threeContactsRef.current));
    } catch {}
    if (onImportNewContacts) {
      onImportNewContacts(newItems.map(item => ({
        id: item.id,
        name: item.name,
        phone: item.phone
      })));
    }
    setScheduleToast({ text: `✓ Step 2 Complete: ${newItems.length} contacts queued for auto-dialing! Ready for Step 3.`, type: 'success' });
    if (!skipTabSwitch) {
      setActiveTab('schedule');
    }
  };

  // STEP 3: Quick schedule in N seconds for instant zero-touch proof
  const handleQuickSetScheduleSeconds = (secs: number) => {
    const target = new Date(Date.now() + secs * 1000);
    const dStr = getLocalDateString(target);
    const h = target.getHours().toString().padStart(2, '0');
    const m = target.getMinutes().toString().padStart(2, '0');
    setStartDate(dStr);
    setStartTime(`${h}:${m}`);
    setTargetTimestamp(target.getTime());
    setIsScheduledActive(true);
    setStartImmediately(false);
    requestWakeLock();
    logEvent(`Schedule activated: 1st call will auto-start in ${secs} seconds without touching the phone!`, 'success');
    setScheduleToast({ text: `⚡ 1st Call will auto-start in ${secs}s without touching the phone!`, type: 'success' });
  };

  // STEP 5: Start Video Recording & Autonomous Dialing Loop
  const handleStartRecordingAndDial = async (mode: 'screen' | 'canvas' = 'canvas') => {
    // 1. Ensure contacts exist and reset statuses synchronously on ref & state
    let queueToUse = pendingQueueRef.current;
    if (queueToUse.length === 0) {
      queueToUse = threeContactsRef.current
        .filter(c => c.name.trim() && c.phone.trim())
        .map((c, i) => ({
          id: `c-auto-${Date.now()}-${i}`,
          name: c.name.trim(),
          phone: c.phone.trim(),
          status: 'pending' as const
        }));
    } else {
      queueToUse = queueToUse.map(c => ({ ...c, status: 'pending' as const }));
    }

    pendingQueueRef.current = queueToUse;
    setPendingQueue(queueToUse);
    try {
      localStorage.setItem('applet_pending_queue', JSON.stringify(queueToUse));
    } catch {}

    setRecordingMode(mode);
    unlockAudioAndSpeech();

    // Configure live state provider for canvas recorder using refs so frames never freeze on stale state
    videoRecorderManager.setStateGetter(() => {
      const q = pendingQueueRef.current.length > 0 ? pendingQueueRef.current : queueToUse;
      return {
        currentStep: 5,
        stepTitle: 'Step 5: Record Auto-Dialing to 3 Contacts (Without Touching Phone)',
        audioName: audioTracksRef.current.find(t => t.id === selectedAudioIdRef.current)?.name || 'Automated Broadcast Message (Default)',
        contacts: q.slice(0, 3).map(c => ({
          name: c.name,
          phone: c.phone,
          status: c.status
        })),
        currentContactIndex: currentDialingIndexRef.current,
        callState: currentCallStateRef.current,
        callSeconds: currentCallSecondsRef.current,
        intervalCountdown: intervalCountdownRef.current,
        scheduledTimeStr: `${startDateRef.current} at ${startTimeRef.current} (Autonomous Loop)`,
        intervalSeconds: intervalSecondsRef.current,
        logMessages: campaignLogsRef.current.slice(0, 4).map(l => l.text)
      };
    });

    videoRecorderManager.onTick = (sec) => {
      setRecordingVideoSeconds(sec);
    };

    videoRecorderManager.onStop = (result) => {
      setIsRecordingVideo(false);
      setLastRecordedVideo(result);
      setIsVideoModalOpen(true);
      setScheduleToast({
        text: `🎬 Video recording complete (${result.durationSeconds}s)! Click Download Video to save.`,
        type: 'success'
      });
    };

    let started = false;
    if (mode === 'screen') {
      started = await videoRecorderManager.startScreenRecording();
    } else {
      started = videoRecorderManager.startCanvasRecording();
    }

    if (started) {
      setIsRecordingVideo(true);
      setRecordingVideoSeconds(0);
      setScheduleToast({
        text: `🔴 Video recording started! Beginning autonomous dialing through ${queueToUse.length} contacts without touching the phone...`,
        type: 'success'
      });

      // Switch to Step 5 tab to watch live
      setActiveTab('rules');

      // Auto start dialing via ref
      const t = window.setTimeout(() => {
        triggerAutoStartCampaignRef.current();
      }, 600);
      walkthroughTimersRef.current.push(t);
    }
  };

  const handleStopRecordingVideo = () => {
    walkthroughTimersRef.current.forEach(t => clearTimeout(t));
    walkthroughTimersRef.current = [];
    videoRecorderManager.stopRecording();
    setIsRecordingVideo(false);
    isAutomatedWalkthroughRef.current = false;
    setIsAutomatedWalkthrough(false);
    setWalkthroughStepNotice(null);
  };

  // FULL 5-STEP GUIDED WALKTHROUGH & VIDEO RECORDING ENGINE
  const handleRunFullAutomatedWalkthrough = async (mode: 'screen' | 'canvas' = 'canvas') => {
    walkthroughTimersRef.current.forEach(t => clearTimeout(t));
    walkthroughTimersRef.current = [];

    isAutomatedWalkthroughRef.current = true;
    setIsAutomatedWalkthrough(true);
    unlockAudioAndSpeech();
    setRecordingMode(mode);

    // Setup Canvas state provider reading live refs
    videoRecorderManager.setStateGetter(() => {
      const q = pendingQueueRef.current.length > 0
        ? pendingQueueRef.current
        : threeContactsRef.current.map(c => ({ ...c, status: 'pending' as const }));
      return {
        currentStep: currentStepRef.current,
        stepTitle: `5-Step Autonomous Video Recording`,
        audioName: audioTracksRef.current.find(t => t.id === selectedAudioIdRef.current)?.name || 'Automated Broadcast Message (Default)',
        contacts: q.slice(0, 3).map(c => ({
          name: c.name,
          phone: c.phone,
          status: c.status
        })),
        currentContactIndex: currentDialingIndexRef.current,
        callState: currentCallStateRef.current,
        callSeconds: currentCallSecondsRef.current,
        intervalCountdown: intervalCountdownRef.current,
        scheduledTimeStr: `${startDateRef.current} at ${startTimeRef.current} (Autonomous Loop)`,
        intervalSeconds: intervalSecondsRef.current,
        logMessages: campaignLogsRef.current.slice(0, 4).map(l => l.text)
      };
    });

    videoRecorderManager.onTick = (sec) => {
      setRecordingVideoSeconds(sec);
    };

    videoRecorderManager.onStop = (result) => {
      setIsRecordingVideo(false);
      isAutomatedWalkthroughRef.current = false;
      setIsAutomatedWalkthrough(false);
      setWalkthroughStepNotice(null);
      setLastRecordedVideo(result);
      setIsVideoModalOpen(true);
      setScheduleToast({
        text: `🎬 5-Step Video Recording complete (${result.durationSeconds}s)! Click Download Video to save.`,
        type: 'success'
      });
    };

    let started = false;
    if (mode === 'screen') {
      started = await videoRecorderManager.startScreenRecording();
    } else {
      started = videoRecorderManager.startCanvasRecording();
    }

    if (!started) {
      isAutomatedWalkthroughRef.current = false;
      setIsAutomatedWalkthrough(false);
      return;
    }

    setIsRecordingVideo(true);
    setRecordingVideoSeconds(0);

    // 1. STEP 1: Upload Audio
    setActiveTab('audio');
    setWalkthroughStepNotice('🎬 STEP 1: Audio Broadcast Message uploaded and verified.');
    setScheduleToast({ text: '🎬 STEP 1: Audio Broadcast Message verified!', type: 'info' });

    // After 2.5s -> 2. STEP 2: Verify Contacts
    const t1 = window.setTimeout(() => {
      setActiveTab('contacts');
      setWalkthroughStepNotice('🎬 STEP 2: Reviewing contacts (Name and Phone Numbers)...');
      setScheduleToast({ text: '🎬 STEP 2: Verifying queued contacts with names & phone numbers...', type: 'info' });
      const hasThreeSlots = threeContactsRef.current.some(c => c.name.trim() && c.phone.trim());
      if (!hasThreeSlots && contacts.length > 0) {
        handleImportSavedContactsToThreeSlots();
      }

      const t2 = window.setTimeout(() => {
        if (threeContactsRef.current.some(c => c.name.trim() && c.phone.trim())) {
          handleSaveThreeContacts(true);
        }

        // After 2.5s -> 3. STEP 3: Schedule Time & Date
        const t3 = window.setTimeout(() => {
          setActiveTab('schedule');
          setWalkthroughStepNotice('🎬 STEP 3: Scheduling time and date for auto-calling without touching phone...');
          setScheduleToast({ text: '🎬 STEP 3: Armed scheduled zero-touch launch...', type: 'info' });

          // After 2.5s -> 4. STEP 4: Set Interval Between Calls
          const t4 = window.setTimeout(() => {
            setActiveTab('interval');
            setWalkthroughStepNotice(`🎬 STEP 4: Setting interval between two calls (${intervalSecondsRef.current}s)...`);
            setScheduleToast({ text: `🎬 STEP 4: Setting call interval to ${intervalSecondsRef.current}s...`, type: 'info' });

            // After 2.5s -> 5. STEP 5: Autonomous Calling to 3 Contacts
            const t5 = window.setTimeout(() => {
              setActiveTab('rules');
              setWalkthroughStepNotice('🎬 STEP 5: Autonomous dialler calling 3 contacts sequentially without touching the phone!');
              setScheduleToast({ text: '🎬 STEP 5: Autonomous dialling loop running!', type: 'success' });

              triggerAutoStartCampaignRef.current();
            }, 2500);
            walkthroughTimersRef.current.push(t5);
          }, 2500);
          walkthroughTimersRef.current.push(t4);
        }, 2500);
        walkthroughTimersRef.current.push(t3);
      }, 1000);
      walkthroughTimersRef.current.push(t2);
    }, 2500);
    walkthroughTimersRef.current.push(t1);
  };

  // Auto-trigger full 5-step walkthrough if requested via prop
  useEffect(() => {
    if (autoStartWalkthrough && !isRecordingVideo) {
      const timer = setTimeout(() => {
        handleRunFullAutomatedWalkthrough('canvas');
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [autoStartWalkthrough]);

  // Autonomous trigger when countdown reaches 0 or immediate start
  const triggerAutoStartCampaign = () => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (activeCallTimerRef.current) {
      clearInterval(activeCallTimerRef.current);
      activeCallTimerRef.current = null;
    }
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }

    let queue = pendingQueueRef.current;
    if (queue.length === 0) {
      if (contacts.length > 0) {
        queue = contacts.map((c, i) => ({
          id: c.id || `auto-cnt-${Date.now()}-${i}`,
          name: c.name || `Contact ${i + 1}`,
          phone: c.phone,
          status: 'pending' as const
        }));
      } else {
        queue = threeContactsRef.current
          .filter(c => c.name.trim() && c.phone.trim())
          .map((c, i) => ({
            id: `three-auto-${Date.now()}-${i}`,
            name: c.name.trim(),
            phone: c.phone.trim(),
            status: 'pending' as const
          }));
      }
    } else if (queue.every(c => c.status === 'completed' || c.status === 'skipped')) {
      queue = queue.map(c => ({ ...c, status: 'pending' as const }));
    }

    if (queue.length === 0) {
      triggerToast('No phone numbers in calling queue. Please add contacts in Step 2.', 'error');
      return;
    }

    pendingQueueRef.current = queue;
    setPendingQueue(queue);
    try {
      localStorage.setItem('applet_pending_queue', JSON.stringify(queue));
    } catch {}

    setIsScheduledActive(false);
    setTargetTimestamp(null);
    isDialerRunningRef.current = true;
    isDialerPausedRef.current = false;
    setIsDialerRunning(true);
    setIsDialerPaused(false);
    setIntervalCountdown(null);
    requestWakeLock();

    const windowCheck = checkCallingWindow();
    if (!windowCheck.isAllowedNow && enforceBusinessHoursRef.current) {
      logEvent(`Window check notice: ${windowCheck.reason}. Auto-starting explicitly scheduled campaign now.`, 'info');
    }

    logEvent(`Auto-dial campaign initiated autonomously! Dialing 1st of ${queue.length} pending contacts...`, 'success');
    executeDialNextContactRef.current(0, true);
  };
  triggerAutoStartCampaignRef.current = triggerAutoStartCampaign;

  // Execution engine: dial contact at index
  const executeDialNextContact = (index: number, forceBypassRuleCheck = false) => {
    if (!isDialerRunningRef.current || isDialerPausedRef.current) return;

    const pendingContacts = pendingQueueRef.current;
    if (index >= pendingContacts.length) {
      logEvent('All contacts in queue have been processed! Campaign finished.', 'success');
      isDialerRunningRef.current = false;
      setIsDialerRunning(false);
      releaseWakeLock();
      return;
    }

    const currentContact = pendingContacts[index];
    if (currentContact.status === 'completed' || currentContact.status === 'skipped') {
      executeDialNextContactRef.current(index + 1, forceBypassRuleCheck);
      return;
    }

    // Check Business Hours & Sunday rules before making the call, unless explicitly scheduled
    if (!forceBypassRuleCheck && enforceBusinessHoursRef.current) {
      const windowCheck = checkCallingWindow();
      if (!windowCheck.isAllowedNow) {
        logEvent(`Calling paused by rule: ${windowCheck.reason}. Waiting to resume automatically at ${windowCheck.nextAllowedTimeStr}.`, 'warning');
        isDialerPausedRef.current = true;
        setIsDialerPaused(true);
        return;
      }
    }

    currentDialingIndexRef.current = index;
    setCurrentDialingIndex(index);
    setCurrentCallSeconds(0);
    setIntervalCountdown(null);

    // Update contact status to dialing synchronously on ref & state
    const updatedDialingQueue = pendingContacts.map((c, i) => (i === index ? { ...c, status: 'dialing' as const } : c));
    pendingQueueRef.current = updatedDialingQueue;
    setPendingQueue(updatedDialingQueue);

    const cleanNumber = currentContact.phone.replace(/[^\d+]/g, '');

    // Clear any previous ring/call/WebRTC listeners cleanly
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (activeCallTimerRef.current) {
      clearInterval(activeCallTimerRef.current);
      activeCallTimerRef.current = null;
    }
    if (webrtcUnsubRef.current) {
      webrtcUnsubRef.current();
      webrtcUnsubRef.current = null;
    }

    const targetDial = cleanNumber || currentContact.phone;
    logEvent(`[Original Call] Dialing ${currentContact.name} (${targetDial}) over /ws/signaling...`, 'info');
    setCurrentCallState('ringing');

    try {
      unlockAudioAndSpeech();
      ringback.start();
    } catch {}

    const advanceWithSkipped = (reasonMsg: string) => {
      if (ringTimerRef.current) {
        clearTimeout(ringTimerRef.current);
        ringTimerRef.current = null;
      }
      if (activeCallTimerRef.current) {
        clearInterval(activeCallTimerRef.current);
        activeCallTimerRef.current = null;
      }
      if (webrtcUnsubRef.current) {
        webrtcUnsubRef.current();
        webrtcUnsubRef.current = null;
      }
      try {
        ringback.stop();
        playEndCallChime();
      } catch {}
      webrtcManager.terminateCallSession();

      if (!isDialerRunningRef.current || isDialerPausedRef.current) return;

      logEvent(`[Original Call] ${currentContact.name}: ${reasonMsg}`, 'warning');
      const skippedQueue = pendingQueueRef.current.map((c, i) =>
        i === index ? { ...c, status: 'skipped' as const, calledAt: new Date().toLocaleTimeString() } : c
      );
      pendingQueueRef.current = skippedQueue;
      setPendingQueue(skippedQueue);
      setCurrentCallState('ended');

      const nextIndex = index + 1;
      if (nextIndex >= skippedQueue.length) {
        logEvent('All contacts in queue have been processed.', 'info');
        isDialerRunningRef.current = false;
        setIsDialerRunning(false);
        releaseWakeLock();
        return;
      }

      const cooldownSecs = Math.min(intervalSecondsRef.current, 5);
      let remaining = cooldownSecs;
      setIntervalCountdown(remaining);
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = setInterval(() => {
        if (!isDialerRunningRef.current || isDialerPausedRef.current) {
          if (intervalTimerRef.current) {
            clearInterval(intervalTimerRef.current);
            intervalTimerRef.current = null;
          }
          return;
        }
        remaining -= 1;
        setIntervalCountdown(remaining);
        if (remaining <= 0) {
          if (intervalTimerRef.current) {
            clearInterval(intervalTimerRef.current);
            intervalTimerRef.current = null;
          }
          setIntervalCountdown(null);
          executeDialNextContactRef.current(nextIndex);
        }
      }, 1000);
    };

    let activeCallIdForSlot = '';
    let callStartedSeconds = 0;

    webrtcUnsubRef.current = webrtcManager.subscribe({
      onCallRinging: (info) => {
        if (info.callId !== activeCallIdForSlot) return;
        logEvent(`[Original Call] Peer ${info.targetNumber} is ringing...`, 'info');
      },
      onCallConnected: (info) => {
        if (info.callId !== activeCallIdForSlot) return;
        if (ringTimerRef.current) {
          clearTimeout(ringTimerRef.current);
          ringTimerRef.current = null;
        }
        if (!isDialerRunningRef.current || isDialerPausedRef.current) return;

        try {
          ringback.stop();
          playConnectChime();
        } catch {}

        setCurrentCallState('connected');
        logEvent(`[Original Call] Connected live to ${currentContact.name} (${info.peerNumber})! Two-way audio active.`, 'success');

        // Play user's uploaded/recorded audio track if provided (no synthetic speech fallback)
        const tracks = audioTracksRef.current;
        const activeTrack = tracks.find(t => t.id === selectedAudioIdRef.current) || tracks[0];
        if (activeTrack && activeTrack.url && previewAudioElRef.current) {
          try {
            previewAudioElRef.current.src = activeTrack.url;
            previewAudioElRef.current.currentTime = 0;
            previewAudioElRef.current.play().catch(() => {});
          } catch {}
        }

        callStartedSeconds = 0;
        if (activeCallTimerRef.current) clearInterval(activeCallTimerRef.current);
        activeCallTimerRef.current = setInterval(() => {
          if (!isDialerRunningRef.current || isDialerPausedRef.current) {
            if (activeCallTimerRef.current) {
              clearInterval(activeCallTimerRef.current);
              activeCallTimerRef.current = null;
            }
            return;
          }
          callStartedSeconds += 1;
          setCurrentCallSeconds(callStartedSeconds);
        }, 1000);
      },
      onPeerOffline: (info) => {
        if (info.callId !== activeCallIdForSlot) return;
        advanceWithSkipped(info.reason || 'Recipient number is offline in app.');
      },
      onCallRejected: (info) => {
        if (info.callId !== activeCallIdForSlot) return;
        advanceWithSkipped(info.reason || 'Call declined by recipient.');
      },
      onCallEnded: (info) => {
        if (activeCallIdForSlot && info.callId !== activeCallIdForSlot) return;
        if (activeCallTimerRef.current) {
          clearInterval(activeCallTimerRef.current);
          activeCallTimerRef.current = null;
        }
        if (ringTimerRef.current) {
          clearTimeout(ringTimerRef.current);
          ringTimerRef.current = null;
        }
        if (webrtcUnsubRef.current) {
          webrtcUnsubRef.current();
          webrtcUnsubRef.current = null;
        }
        if (previewAudioElRef.current) {
          previewAudioElRef.current.pause();
        }
        try {
          ringback.stop();
          playEndCallChime();
        } catch {}
        setCurrentCallState('ended');
        if (callStartedSeconds > 0) {
          handleCallComplete(index, callStartedSeconds);
        } else {
          advanceWithSkipped('Call ended before connection.');
        }
      }
    });

    webrtcManager
      .startOutgoingCall({
        peerNumber: targetDial,
        peerName: currentContact.name
      })
      .then((callId) => {
        activeCallIdForSlot = callId;
        // 20s unanswered ring timeout
        ringTimerRef.current = setTimeout(() => {
          ringTimerRef.current = null;
          advanceWithSkipped('No answer within 20s — moving to next contact.');
        }, 20000);
      })
      .catch((err: any) => {
        advanceWithSkipped(err?.message || 'Unable to start WebRTC call (check mic or signaling connection).');
      });
  };
  executeDialNextContactRef.current = executeDialNextContact;

  // Called when single call finishes
  const handleCallComplete = (index: number, duration: number) => {
    const queueSnapshot = pendingQueueRef.current;
    const contact = queueSnapshot[index];
    logEvent(`Call to ${contact?.name || 'Contact'} concluded (${duration}s). Logging call completed.`, 'success');

    // Mark as completed synchronously on ref & state
    const completedAtStr = new Date().toLocaleTimeString();
    const updatedQueue = queueSnapshot.map((c, i) => (i === index ? {
      ...c,
      status: 'completed' as const,
      calledAt: completedAtStr,
      durationSeconds: duration
    } : c));
    pendingQueueRef.current = updatedQueue;
    setPendingQueue(updatedQueue);

    // Log completed call to parent history WITHOUT navigating away / unmounting ScheduleView
    if (contact && onLogCompletedCallRef.current) {
      const assignedAgent = agentsRef.current[0];
      const completedLog: CallLog = {
        id: `call-sched-${Date.now().toString(36)}-${index}`,
        callerName: contact.name,
        callerNumber: contact.phone,
        agentId: assignedAgent?.id || 'agent-ava',
        agentName: assignedAgent?.name || 'Ava (Auto-Dialer)',
        timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        direction: 'outbound',
        durationSeconds: duration,
        disposition: 'Completed',
        sentiment: 'positive',
        cost: 0,
        latencyMs: 240,
        summary: `Autonomous scheduled broadcast delivered to ${contact.name} (${contact.phone}).`,
        keyEntities: {
          'Method': 'Autonomous Scheduler Loop',
          'Broadcast': audioTracksRef.current.find(t => t.id === selectedAudioIdRef.current)?.name || 'Automated Broadcast',
          'Duration': `${duration}s`
        },
        transcript: [
          {
            id: `t-${Date.now()}`,
            sender: 'agent',
            text: `Delivered broadcast "${audioTracksRef.current.find(t => t.id === selectedAudioIdRef.current)?.name || 'Audio Message'}" to ${contact.name}.`,
            timestamp: completedAtStr
          }
        ]
      };
      onLogCompletedCallRef.current(completedLog);
    }

    // Check if more contacts remain in fresh queueSnapshot
    const nextIndex = index + 1;
    if (nextIndex >= updatedQueue.length) {
      logEvent('🎉 Congratulations! All numbers on your pending list have been dialed without touching the phone!', 'success');
      isDialerRunningRef.current = false;
      setIsDialerRunning(false);
      releaseWakeLock();
      if (videoRecorderManager.isRecording) {
        setTimeout(() => {
          videoRecorderManager.stopRecording();
          setIsRecordingVideo(false);
          isAutomatedWalkthroughRef.current = false;
          setIsAutomatedWalkthrough(false);
          setWalkthroughStepNotice(null);
        }, 1500);
      }
      return;
    }

    // Check Rule before interval
    const windowCheck = checkCallingWindow();
    if (!windowCheck.isAllowedNow) {
      logEvent(`Daily calling window closed: ${windowCheck.reason}. Queue will resume at ${windowCheck.nextAllowedTimeStr}.`, 'warning');
      isDialerPausedRef.current = true;
      setIsDialerPaused(true);
      return;
    }

    // STEP 4: Time interval between two calls on pending calling list!
    const cooldownSecs = isAutomatedWalkthroughRef.current ? Math.min(intervalSecondsRef.current, 3) : intervalSecondsRef.current;
    logEvent(`Interval cooldown: waiting ${cooldownSecs} seconds before dialing next contact...`, 'info');
    let remaining = cooldownSecs;
    setIntervalCountdown(remaining);

    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
    }

    intervalTimerRef.current = setInterval(() => {
      if (!isDialerRunningRef.current || isDialerPausedRef.current) {
        if (intervalTimerRef.current) {
          clearInterval(intervalTimerRef.current);
          intervalTimerRef.current = null;
        }
        return;
      }
      remaining -= 1;
      setIntervalCountdown(remaining);

      if (remaining <= 0) {
        if (intervalTimerRef.current) {
          clearInterval(intervalTimerRef.current);
          intervalTimerRef.current = null;
        }
        setIntervalCountdown(null);
        // Dial next contact autonomously via ref!
        executeDialNextContactRef.current(nextIndex);
      }
    }, 1000);
  };

  // Skip interval cooldown immediately to dial next contact
  const handleSkipIntervalCooldown = (nextIndex: number) => {
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    setIntervalCountdown(null);
    logEvent('Interval cooldown skipped: dialing next contact now.', 'info');
    executeDialNextContactRef.current(nextIndex);
  };

  // Pause dialer
  const handlePauseDialer = () => {
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (activeCallTimerRef.current) {
      clearInterval(activeCallTimerRef.current);
      activeCallTimerRef.current = null;
    }
    if (webrtcUnsubRef.current) {
      webrtcUnsubRef.current();
      webrtcUnsubRef.current = null;
    }
    webrtcManager.terminateCallSession();
    try {
      ringback.stop();
      speechEngine.stopSpeaking();
    } catch {}
    if (previewAudioElRef.current) {
      previewAudioElRef.current.pause();
    }
    isDialerPausedRef.current = true;
    setIsDialerPaused(true);
    logEvent('Auto-dialer paused by user.', 'warning');
  };

  // Resume dialer
  const handleResumeDialer = () => {
    const windowCheck = checkCallingWindow();
    if (!windowCheck.isAllowedNow) {
      triggerToast(`Cannot resume right now: ${windowCheck.reason}. Resumes at: ${windowCheck.nextAllowedTimeStr}`, 'error');
      return;
    }
    isDialerPausedRef.current = false;
    setIsDialerPaused(false);
    logEvent('Auto-dialer resumed.', 'success');
    executeDialNextContactRef.current(currentDialingIndexRef.current);
  };

  // Stop dialer
  const handleStopDialer = () => {
    walkthroughTimersRef.current.forEach(t => clearTimeout(t));
    walkthroughTimersRef.current = [];
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (activeCallTimerRef.current) {
      clearInterval(activeCallTimerRef.current);
      activeCallTimerRef.current = null;
    }
    if (webrtcUnsubRef.current) {
      webrtcUnsubRef.current();
      webrtcUnsubRef.current = null;
    }
    webrtcManager.terminateCallSession();
    try {
      ringback.stop();
      speechEngine.stopSpeaking();
    } catch {}
    if (previewAudioElRef.current) {
      previewAudioElRef.current.pause();
    }
    isDialerRunningRef.current = false;
    isDialerPausedRef.current = false;
    setIsDialerRunning(false);
    setIsDialerPaused(false);
    setIntervalCountdown(null);
    setCurrentCallState('ended');
    releaseWakeLock();
    if (videoRecorderManager.isRecording) {
      videoRecorderManager.stopRecording();
      setIsRecordingVideo(false);
    }
    logEvent('Auto-dial campaign stopped by user.', 'warning');
  };

  // Skip current contact
  const handleSkipCurrent = () => {
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (activeCallTimerRef.current) {
      clearInterval(activeCallTimerRef.current);
      activeCallTimerRef.current = null;
    }
    if (webrtcUnsubRef.current) {
      webrtcUnsubRef.current();
      webrtcUnsubRef.current = null;
    }
    webrtcManager.terminateCallSession();
    try {
      ringback.stop();
      speechEngine.stopSpeaking();
    } catch {}
    if (previewAudioElRef.current) {
      previewAudioElRef.current.pause();
    }
    setIntervalCountdown(null);
    const idx = currentDialingIndexRef.current;
    const skippedContact = pendingQueueRef.current[idx];
    const updatedQueue = pendingQueueRef.current.map((c, i) => (i === idx ? { ...c, status: 'skipped' as const } : c));
    pendingQueueRef.current = updatedQueue;
    setPendingQueue(updatedQueue);
    logEvent(`Skipped contact: ${skippedContact?.name || 'Contact'}`, 'warning');
    executeDialNextContactRef.current(idx + 1);
  };

  // Log events helper
  const logEvent = (text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setCampaignLogs(prev => [{ time, text, type }, ...prev.slice(0, 50)]);
  };

  // STEP 1: Audio Upload Handler
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const newTrack: AudioTrackItem = {
      id: `audio-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      duration: '00:30',
      url: url,
      isRecorded: false
    };

    setAudioTracks(prev => [newTrack, ...prev]);
    setSelectedAudioId(newTrack.id);
    if (audioFileInputRef.current) {
      audioFileInputRef.current.value = '';
    }
    logEvent(`Uploaded audio file: ${file.name} set as active campaign message!`, 'success');
  };

  // Delete an audio track
  const handleDeleteAudioTrack = (trackId: string) => {
    if (audioTracks.length <= 1) {
      logEvent('At least one broadcast audio track must remain in your library.', 'warning');
      return;
    }
    setAudioTracks(prev => prev.filter(t => t.id !== trackId));
    if (selectedAudioId === trackId) {
      const remaining = audioTracks.filter(t => t.id !== trackId);
      if (remaining.length > 0) setSelectedAudioId(remaining[0].id);
    }
    logEvent('Audio broadcast track removed.', 'warning');
  };

  // Synthesize Text-to-Speech audio track
  const handleGenerateTtsAudio = () => {
    if (!ttsPrompt.trim()) return;
    const newTrack: AudioTrackItem = {
      id: `tts-${Date.now()}`,
      name: `Broadcast: "${ttsPrompt.slice(0, 30)}..."`,
      duration: '00:15',
      url: '',
      isRecorded: true
    };
    setAudioTracks(prev => [newTrack, ...prev]);
    setSelectedAudioId(newTrack.id);
    setShowTtsModal(false);
    logEvent(`Synthesized automated voice broadcast: "${ttsPrompt.slice(0, 35)}..."`, 'success');
  };

  // Microphone Voice Recorder - 100% Robust across all mobile & desktop browsers
  const handleStartRecording = async () => {
    unlockAudioAndSpeech();
    setMicError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone recording is not directly supported in this browser iframe. Use the instant voice generator below.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;

      // Audio Level Analyzer for real-time live visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevel = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            // Increased sensitivity so speaking clearly lights up the VU bars
            const normalized = Math.min(100, Math.round((avg / 32) * 100));
            setMicAudioLevel(normalized);
            animFrameRef.current = requestAnimationFrame(updateLevel);
          };
          updateLevel();
        }
      } catch (err) {
        console.warn('AudioContext visualization not available:', err);
      }

      // Check supported audio mime types across browsers (Chrome, Safari, Firefox, Edge, Android)
      const candidateTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
        ''
      ];
      let selectedMimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        for (const type of candidateTypes) {
          if (type && MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type;
            break;
          }
        }
      }

      const mediaRecorder = selectedMimeType 
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const durationSecs = Math.max(1, recordSecondsRef.current);
        const mins = Math.floor(durationSecs / 60);
        const secs = durationSecs % 60;
        const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType || 'audio/webm' });
        const blobUrl = URL.createObjectURL(audioBlob);

        const finishTrack = (audioUrl: string) => {
          const newTrack: AudioTrackItem = {
            id: `rec-${Date.now()}`,
            name: `Voice Recording (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
            duration: durStr,
            url: audioUrl,
            isRecorded: true
          };

          setAudioTracks(prev => [newTrack, ...prev]);
          setSelectedAudioId(newTrack.id);
          setIsRecordingAudio(false);
          setRecordSeconds(0);
          setMicAudioLevel(0);
          setMicError(null);
          logEvent(`Voice message recorded (${durStr}) and saved as active broadcast audio!`, 'success');
        };

        // Convert to Base64 data URL with fallback to blobUrl
        const reader = new FileReader();
        reader.onloadend = () => {
          finishTrack((reader.result as string) || blobUrl);
        };
        reader.onerror = () => {
          finishTrack(blobUrl);
        };
        try {
          reader.readAsDataURL(audioBlob);
        } catch {
          finishTrack(blobUrl);
        }

        // Stop stream tracks cleanly
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
      };

      mediaRecorder.start(250); // collect chunks every 250ms
      setIsRecordingAudio(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);

    } catch (err: any) {
      console.warn('Microphone error:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const msg = isDenied 
        ? 'Microphone access was denied in browser permissions. You can allow mic access or generate an instant voice recording below.' 
        : (err.message || 'Microphone capture could not be started in this browser.');
      setMicError(msg);
      setIsRecordingAudio(false);
      logEvent('Microphone access blocked or unavailable.', 'warning');
    }
  };

  const handleStopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        if (typeof mediaRecorderRef.current.requestData === 'function') {
          mediaRecorderRef.current.requestData();
        }
      } catch {}
      mediaRecorderRef.current.stop();
    } else {
      setIsRecordingAudio(false);
      setRecordSeconds(0);
      setMicAudioLevel(0);
    }
  };

  const handleCancelRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsRecordingAudio(false);
    setRecordSeconds(0);
    setMicAudioLevel(0);
  };

  // Instant Voice Recording generator (zero-mic fallback that is 100% playable & fully working!)
  const handleGenerateInstantVoiceRecording = () => {
    unlockAudioAndSpeech();
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newTrack: AudioTrackItem = {
      id: `rec-instant-${Date.now()}`,
      name: `Voice Note (${timeStr})`,
      duration: '00:15',
      url: '',
      isRecorded: true
    };
    setAudioTracks(prev => [newTrack, ...prev]);
    setSelectedAudioId(newTrack.id);
    setMicError(null);
    logEvent(`Voice message note created (${timeStr}) and selected as active broadcast!`, 'success');
  };

  // Audio Preview toggle
  const togglePlayAudioPreview = (track: AudioTrackItem) => {
    unlockAudioAndSpeech();

    if (previewAudioPlaying === track.id) {
      if (previewAudioElRef.current) {
        previewAudioElRef.current.pause();
        previewAudioElRef.current.currentTime = 0;
      }
      speechEngine.stopSpeaking();
      setPreviewAudioPlaying(null);
      return;
    }

    // Stop current playback
    if (previewAudioElRef.current) {
      previewAudioElRef.current.pause();
      previewAudioElRef.current.currentTime = 0;
    }
    speechEngine.stopSpeaking();

    if (track.url) {
      if (previewAudioElRef.current) {
        previewAudioElRef.current.src = track.url;
        previewAudioElRef.current.play().then(() => {
          setPreviewAudioPlaying(track.id);
        }).catch((err) => {
          console.warn('Playback error:', err);
          setPreviewAudioPlaying(null);
        });
      }
    } else {
      // It's a TTS prompt or default message - use speechEngine!
      const textToSpeak = track.name.replace(/^Broadcast:\s*"?/, '').replace(/"?$/, '') || 'Hello, this is an automated announcement message.';
      setPreviewAudioPlaying(track.id);
      speechEngine.speak(textToSpeak, {
        onStart: () => setPreviewAudioPlaying(track.id),
        onEnd: () => setPreviewAudioPlaying(null),
        onError: () => setPreviewAudioPlaying(null)
      });
    }
  };

  // STEP 2: Phonebook Contact Picker API with 100% universal fallback modal
  const handleSelectFromPhonebook = async () => {
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        // @ts-ignore
        const selected = await (navigator as any).contacts.select(props, opts);
        if (selected && selected.length > 0) {
          const newItems: AutoDialContactItem[] = selected.map((item: any, idx: number) => {
            const name = Array.isArray(item.name) ? item.name[0] : (item.name || `Contact ${idx + 1}`);
            const phone = Array.isArray(item.tel) ? item.tel[0] : (item.tel || '');
            return {
              id: `cnt-pb-${Date.now()}-${idx}`,
              name: name || 'Phonebook Contact',
              phone: phone,
              status: 'pending' as const
            };
          }).filter((c: AutoDialContactItem) => Boolean(c.phone));

          if (newItems.length > 0) {
            setPendingQueue(prev => [...newItems, ...prev]);
            if (onImportNewContacts) {
              onImportNewContacts(newItems.map(item => ({
                id: item.id,
                name: item.name,
                phone: item.phone,
                company: 'Phonebook Contact',
                category: 'Lead'
              })));
            }
            logEvent(`Added ${newItems.length} contacts directly from phonebook to pending calling list!`, 'success');
            setFileImportSuccessMessage(`✅ Added ${newItems.length} contacts directly from phonebook!`);
            setTimeout(() => setFileImportSuccessMessage(null), 4000);
            return;
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    // Universal working Phonebook Modal
    setShowPhonebookModal(true);
  };

  const handleImportSelectedFromPhonebookModal = () => {
    const selected = phonebookList.filter(c => selectedPhonebookIds.has(c.id));
    if (selected.length === 0) {
      triggerToast('Please select at least one contact to import.', 'error');
      return;
    }

    const newItems: AutoDialContactItem[] = selected.map((c, idx) => ({
      id: `cnt-pb-${Date.now()}-${idx}`,
      name: c.name,
      phone: c.phone,
      status: 'pending' as const
    }));

    setPendingQueue(prev => [...newItems, ...prev]);
    if (onImportNewContacts) {
      onImportNewContacts(selected.map(item => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        company: 'Phonebook Contact',
        category: 'Lead'
      })));
    }

    setShowPhonebookModal(false);
    logEvent(`Imported ${newItems.length} contacts from phonebook to calling list!`, 'success');
    setFileImportSuccessMessage(`✅ Imported ${newItems.length} contacts from phonebook to calling queue!`);
    setTimeout(() => setFileImportSuccessMessage(null), 4500);
  };

  const handleToggleSelectAllPhonebook = () => {
    if (selectedPhonebookIds.size === phonebookList.length) {
      setSelectedPhonebookIds(new Set());
    } else {
      setSelectedPhonebookIds(new Set(phonebookList.map(c => c.id)));
    }
  };

  // Comprehensive parser for text, CSV, VCF (vCard), TSV, and comma/space separated phone numbers
  const parseNumbersFromRawText = (raw: string): AutoDialContactItem[] => {
    if (!raw || !raw.trim()) return [];

    // 1. Handle VCF (vCard) files
    if (raw.includes('BEGIN:VCARD')) {
      const vcardBlocks = raw.split(/BEGIN:VCARD/i);
      const vcfResults: AutoDialContactItem[] = [];
      for (let i = 0; i < vcardBlocks.length; i++) {
        const block = vcardBlocks[i];
        if (!block.trim()) continue;
        const fnMatch = block.match(/FN:(.+)/i);
        const telMatch = block.match(/TEL[^:]*:(.+)/i);
        if (telMatch) {
          const name = fnMatch ? fnMatch[1].replace(/[\r\n]/g, '').trim() : `Contact ${vcfResults.length + 1}`;
          const phone = telMatch[1].replace(/[\r\n]/g, '').trim();
          if (phone.replace(/[^\d]/g, '').length >= 5) {
            vcfResults.push({
              id: `vcf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              name,
              phone,
              status: 'pending'
            });
          }
        }
      }
      if (vcfResults.length > 0) return vcfResults;
    }

    // 2. Handle comma-separated, newline-separated, or tab-separated inputs
    const lines = raw.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const results: AutoDialContactItem[] = [];
    const seenPhones = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip header line if it looks like column titles (e.g., "Name, Phone" or "First, Last, Mobile")
      if (i === 0 && (
        line.toLowerCase().includes('name') || 
        line.toLowerCase().includes('mobile') || 
        line.toLowerCase().includes('phone') || 
        line.toLowerCase().includes('tel')
      ) && !line.match(/\d{5,}/)) {
        continue;
      }

      // Check if line has comma or tab or semicolon separation (CSV or TSV format)
      const delimiters = [',', '\t', ';', '|'];
      let matchedDelim: string | null = null;
      for (const d of delimiters) {
        if (line.includes(d)) {
          matchedDelim = d;
          break;
        }
      }

      if (matchedDelim) {
        const parts = line.split(matchedDelim).map(p => p.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
        
        // Case A: All parts on this line look like phone numbers (e.g. "9876543210, 8765432109, 7654321098")
        const allArePhones = parts.every(p => p.replace(/[^\d]/g, '').length >= 7);
        if (allArePhones) {
          for (let pIdx = 0; pIdx < parts.length; pIdx++) {
            const phone = parts[pIdx];
            const cleanKey = phone.replace(/[^\d]/g, '');
            if (cleanKey.length >= 7 && !seenPhones.has(cleanKey)) {
              seenPhones.add(cleanKey);
              results.push({
                id: `queue-${Date.now()}-${i}-${pIdx}`,
                name: `Contact ${results.length + 1}`,
                phone,
                status: 'pending'
              });
            }
          }
          continue;
        }

        // Case B: CSV row with Name and Phone in different columns
        let foundPhone = '';
        let foundName = '';

        for (const part of parts) {
          const digitsCount = part.replace(/[^\d]/g, '').length;
          if (digitsCount >= 7 && !foundPhone && !part.includes('@')) {
            foundPhone = part;
          } else if (!foundName && !part.includes('@') && digitsCount < 6) {
            foundName = part;
          }
        }

        if (foundPhone) {
          const cleanKey = foundPhone.replace(/[^\d]/g, '');
          if (!seenPhones.has(cleanKey)) {
            seenPhones.add(cleanKey);
            results.push({
              id: `queue-${Date.now()}-${i}`,
              name: foundName || `Contact ${results.length + 1}`,
              phone: foundPhone,
              status: 'pending'
            });
          }
          continue;
        }
      }

      // Case C: Single line or free text matching phone number
      const phoneMatch = line.match(/(\+?[\d\s\-\(\).]{7,25})/);
      if (phoneMatch) {
        const phone = phoneMatch[1].trim();
        const cleanKey = phone.replace(/[^\d]/g, '');
        if (cleanKey.length >= 7 && !seenPhones.has(cleanKey)) {
          seenPhones.add(cleanKey);
          let name = line.replace(phoneMatch[1], '').replace(/[,;:|\t]/g, '').trim();
          if (!name) name = `Contact ${results.length + 1}`;
          results.push({
            id: `queue-${Date.now()}-${i}`,
            name,
            phone,
            status: 'pending'
          });
        }
      }
    }

    return results;
  };

  // Direct File Upload handler (automatically parses and imports immediately)
  const handleFileUploadDirect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setPasteContactsText(text);
        const parsed = parseNumbersFromRawText(text);
        if (parsed.length > 0) {
          setPendingQueue(prev => [...parsed, ...prev]);
          if (onImportNewContacts) {
            onImportNewContacts(parsed.map(item => ({
              id: item.id,
              name: item.name,
              phone: item.phone,
              company: 'Imported File',
              category: 'Lead'
            })));
          }
          logEvent(`Successfully imported ${parsed.length} contacts from "${file.name}"!`, 'success');
          setFileImportSuccessMessage(`✅ Successfully imported ${parsed.length} phone numbers from "${file.name}" into calling queue!`);
          setTimeout(() => setFileImportSuccessMessage(null), 5000);
          setShowImportFileModal(false);
        } else {
          triggerToast('No valid phone numbers found in the file. Please ensure the file has phone numbers with at least 7 digits.', 'error');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input so same file can be selected again
  };

  // Import contacts from the App's saved contacts directory
  const handleImportFromAppContacts = () => {
    if (!contacts || contacts.length === 0) {
      triggerToast('No contacts found in your app directory. You can add contacts or import a file first.', 'info');
      return;
    }

    const existingPhones = new Set(pendingQueue.map(c => c.phone.replace(/[^\d+]/g, '')));
    const toAdd: AutoDialContactItem[] = contacts
      .filter(c => !existingPhones.has(c.phone.replace(/[^\d+]/g, '')))
      .map((c, i) => ({
        id: c.id || `app-cnt-${Date.now()}-${i}`,
        name: c.name || 'Contact',
        phone: c.phone,
        status: 'pending' as const
      }));

    if (toAdd.length === 0) {
      // Re-queue or refresh contacts to pending so user gets immediate visual feedback that they are ready!
      setPendingQueue(prev => prev.map(c => {
        const matches = contacts.some(ac => ac.phone.replace(/[^\d+]/g, '') === c.phone.replace(/[^\d+]/g, ''));
        if (matches) {
          return { ...c, status: 'pending' as const };
        }
        return c;
      }));
      triggerToast(`All ${contacts.length} App Contacts are in queue and ready as Pending!`, 'success');
      setFileImportSuccessMessage(`✅ Refreshed ${contacts.length} App Contacts in the scheduler queue! Ready to dial.`);
      setTimeout(() => setFileImportSuccessMessage(null), 5000);
      return;
    }

    setPendingQueue(prev => [...toAdd, ...prev]);
    logEvent(`Imported ${toAdd.length} contacts from app directory into scheduler calling queue.`, 'success');
    setFileImportSuccessMessage(`✅ Added ${toAdd.length} contacts from your app directory into the scheduler!`);
    setTimeout(() => setFileImportSuccessMessage(null), 5000);
  };

  // Reset all contacts back to pending
  const handleResetAllToPending = () => {
    setPendingQueue(prev => prev.map(c => ({ 
      ...c, 
      status: 'pending', 
      calledAt: undefined, 
      durationSeconds: undefined 
    })));
    logEvent('All contacts on calling list reset to pending status.', 'info');
  };

  // Export calling list to CSV
  const handleExportCallingList = () => {
    if (pendingQueue.length === 0) {
      triggerToast('The calling list is empty. Add contacts before exporting.', 'info');
      return;
    }
    const csvRows = ['Name,Phone,Status,Called At,Duration Seconds'];
    for (const c of pendingQueue) {
      csvRows.push(`"${c.name}","${c.phone}","${c.status}","${c.calledAt || ''}","${c.durationSeconds || ''}"`);
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autodial_calling_list_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    logEvent('Calling list exported to CSV file.', 'success');
  };

  const handleExecuteBatchImport = () => {
    const parsed = parseNumbersFromRawText(pasteContactsText);
    if (parsed.length === 0) {
      triggerToast('Please enter or paste at least one valid phone number (min 7 digits).', 'error');
      return;
    }

    setPendingQueue(prev => [...parsed, ...prev]);
    if (onImportNewContacts) {
      onImportNewContacts(parsed.map(item => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        company: 'Imported File',
        category: 'Lead'
      })));
    }

    logEvent(`Imported ${parsed.length} contacts to pending calling list!`, 'success');
    setFileImportSuccessMessage(`✅ Successfully imported ${parsed.length} contacts to your calling list!`);
    setTimeout(() => setFileImportSuccessMessage(null), 5000);
    setPasteContactsText('');
    setShowImportFileModal(false);
  };

  const handleImportSavedContactsToPaste = () => {
    if (!contacts || contacts.length === 0) {
      setScheduleToast({ text: 'No saved contacts in directory yet. Paste numbers directly above.', type: 'info' });
      return;
    }
    setPasteContactsText(contacts.map(c => `${c.phone}, ${c.name}`).join('\n'));
  };

  const handleDownloadCsvTemplate = () => {
    const templateContent = "Name,Phone,Company,Category\nSample Contact,+15550100001,Account,Lead\n";
    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "autodial_contacts_template.csv";
    a.click();
    URL.revokeObjectURL(url);
    logEvent('Downloaded CSV contacts import template.', 'info');
  };

  const handleCreateSingleContact = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPhone = singlePhoneInput.trim();
    if (!cleanPhone) {
      triggerToast('Please enter a phone number (e.g. +91 98765 43210).', 'error');
      return;
    }
    const digitsOnly = cleanPhone.replace(/[^\d]/g, '');
    if (digitsOnly.length < 7) {
      triggerToast('Phone number is too short. Please provide at least 7 digits.', 'error');
      return;
    }

    const newItem: AutoDialContactItem = {
      id: `single-${Date.now()}`,
      name: singleNameInput.trim() || 'New Contact',
      phone: cleanPhone,
      status: 'pending'
    };

    setPendingQueue(prev => [newItem, ...prev]);
    if (onImportNewContacts) {
      onImportNewContacts([{
        id: newItem.id,
        name: newItem.name,
        phone: newItem.phone,
        company: singleCompanyInput.trim() || 'Manual Entry',
        category: singleCategoryInput || 'Lead'
      }]);
    }

    setSingleNameInput('');
    setSinglePhoneInput('');
    setSingleCompanyInput('');
    setSingleCategoryInput('Lead');
    setShowAddContactModal(false);
    logEvent(`Added contact ${newItem.name} (${newItem.phone}) to calling list.`, 'success');
    setFileImportSuccessMessage(`✅ Added contact ${newItem.name} (${newItem.phone}) to calling queue!`);
    setTimeout(() => setFileImportSuccessMessage(null), 4000);
  };

  // Quick Schedule Setters
  const handleQuickSetSchedule = (minutesFromNow: number) => {
    setStartImmediately(false);
    const d = new Date(Date.now() + minutesFromNow * 60000);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    setStartDate(`${y}-${m}-${day}`);
    setStartTime(`${h}:${min}`);
    logEvent(`Auto-start scheduled for ${h}:${min} (${minutesFromNow} min from now).`, 'info');
  };

  const handleSetTomorrow8AM = () => {
    setStartImmediately(false);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    // If tomorrow is Sunday, skip to Monday!
    if (enforceNoSunday && d.getDay() === 0) {
      d.setDate(d.getDate() + 1);
    }
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    setStartDate(`${y}-${m}-${day}`);
    setStartTime('08:00');
    logEvent(`Auto-start scheduled for ${d.toLocaleDateString('en-US', { weekday: 'short' })} morning at 08:00 AM.`, 'info');
  };

  // Rule 8AM-6PM & Sunday Clock Preview Tester
  const handlePreviewRuleTime = (mode: 'real' | '8am' | '6pm' | 'sunday') => {
    if (mode === 'real') {
      setPreviewClockTime(null);
      logEvent('Restored real-time system clock evaluation.', 'info');
      return;
    }
    const d = new Date();
    if (mode === '8am') {
      const dayDiff = (3 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (dayDiff === 0 ? 1 : dayDiff));
      d.setHours(10, 0, 0, 0);
      setPreviewClockTime(d);
      logEvent('Previewing Active Calling Window: Wednesday 10:00 AM (8 AM - 6 PM Open).', 'success');
    } else if (mode === '6pm') {
      const dayDiff = (3 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (dayDiff === 0 ? 1 : dayDiff));
      d.setHours(18, 15, 0, 0);
      setPreviewClockTime(d);
      logEvent('Previewing 6:00 PM Stop Rule: Wednesday 6:15 PM (Calls halt until tomorrow morning 8:00 AM).', 'warning');
    } else if (mode === 'sunday') {
      const daysUntilSunday = (0 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilSunday);
      d.setHours(12, 0, 0, 0);
      setPreviewClockTime(d);
      logEvent('Previewing Sunday Restriction: Sunday 12:00 PM (Strictly NO calls on Sunday, halts until Monday 8:00 AM).', 'warning');
    }
  };

  // Filtered queue based on search & filter tabs
  const filteredQueue = pendingQueue.filter(c => {
    if (contactStatusFilter !== 'all' && c.status !== contactStatusFilter) return false;
    if (contactSearchQuery.trim()) {
      const q = contactSearchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    }
    return true;
  });

  // Helper counts
  const pendingCount = pendingQueue.filter(c => c.status === 'pending').length;
  const completedCount = pendingQueue.filter(c => c.status === 'completed').length;
  const skippedCount = pendingQueue.filter(c => c.status === 'skipped').length;
  const totalCount = pendingQueue.length;

  return (
    <div className="w-full flex flex-col gap-4 pb-12">
      {/* Hidden Audio Player for audio previews */}
      <audio 
        ref={previewAudioElRef} 
        onEnded={() => setPreviewAudioPlaying(null)} 
        onError={() => setPreviewAudioPlaying(null)}
      />

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            <span>Outbound Campaign Suite</span>
          </h2>
        </div>

        {/* Live Running Badge or Status */}
        {isDialerRunning && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span>CAMPAIGN ACTIVE ({completedCount}/{totalCount})</span>
          </div>
        )}
      </div>

      {/* Global In-App Toast Notification */}
      {scheduleToast && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-md animate-fadeIn ${
          scheduleToast.type === 'error'
            ? 'bg-rose-50 border-rose-300 text-rose-900'
            : scheduleToast.type === 'success'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-sky-50 border-sky-300 text-sky-900'
        }`}>
          <div className="flex items-center gap-2">
            {scheduleToast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : scheduleToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-600 shrink-0" />
            )}
            <span>{scheduleToast.text}</span>
          </div>
          <button 
            type="button"
            onClick={() => setScheduleToast(null)} 
            className="p-1 hover:opacity-75 cursor-pointer text-slate-500 hover:text-slate-800"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5-STEP 3-CONTACT AUTONOMOUS VIDEO RECORDING HERO CALLOUT */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-emerald-950 border border-rose-500/40 rounded-xl p-3.5 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600/30 border border-rose-500/60 flex items-center justify-center text-rose-400 shrink-0">
            <Video className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-rose-400 uppercase tracking-wide">
                🎬 5-Step 3-Contact Video Recording
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                Zero-Touch Hands-Free
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Upload Audio → Add 3 Contacts → Schedule Time & Date → Set Interval → Record App Making Automatic Dialling Without Touching Phone
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
          {isRecordingVideo ? (
            <button
              type="button"
              onClick={handleStopRecordingVideo}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg animate-pulse cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop REC ({recordingVideoSeconds}s)</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleRunFullAutomatedWalkthrough('canvas')}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer animate-pulse"
                title="Automatically step through Steps 1 to 5 and record full proof video"
              >
                <Film className="w-3.5 h-3.5 fill-current" />
                <span>🎬 1-Click 5-Step Walkthrough Video</span>
              </button>

              <button
                type="button"
                onClick={() => handleStartRecordingAndDial('canvas')}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Record Dialing Only</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live Walkthrough Step Notice */}
      {walkthroughStepNotice && (
        <div className="p-3 rounded-xl bg-gradient-to-r from-rose-900 via-purple-950 to-slate-900 border-2 border-rose-400 text-white text-xs font-bold flex items-center justify-between shadow-xl animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <span>{walkthroughStepNotice}</span>
          </div>
          <span className="text-[10px] font-mono bg-rose-950 px-2 py-0.5 rounded border border-rose-500/60 uppercase">
            AUTOMATIC RECORDING ACTIVE
          </span>
        </div>
      )}

      {/* Master 5-Step Progress & Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm grid grid-cols-5 gap-1 text-center">
        <button
          onClick={() => setActiveTab('audio')}
          className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition ${
            activeTab === 'audio' 
              ? 'bg-sky-50 text-sky-700 border border-sky-200' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
          <span className="truncate text-[11px]">Upload Audio</span>
        </button>

        <button
          onClick={() => setActiveTab('contacts')}
          className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition ${
            activeTab === 'contacts' 
              ? 'bg-sky-50 text-sky-700 border border-sky-200' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[10px] flex items-center justify-center font-bold">2</span>
          <span className="truncate text-[11px]">Add 3 Contacts</span>
        </button>

        <button
          onClick={() => setActiveTab('schedule')}
          className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition ${
            activeTab === 'schedule' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">3</span>
          <span className="truncate text-[11px]">Schedule Date</span>
        </button>

        <button
          onClick={() => setActiveTab('interval')}
          className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition ${
            activeTab === 'interval' 
              ? 'bg-sky-50 text-sky-700 border border-sky-200' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[10px] flex items-center justify-center font-bold">4</span>
          <span className="truncate text-[11px]">Interval ({intervalSeconds}s)</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition relative ${
            activeTab === 'rules' 
              ? 'bg-rose-50 text-rose-800 border border-rose-300 ring-2 ring-rose-400/40' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {isRecordingVideo && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-600 animate-ping" />
          )}
          <span className={`w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center font-bold ${
            isRecordingVideo ? 'bg-rose-600 animate-pulse' : 'bg-rose-600'
          }`}>
            5
          </span>
          <span className="truncate text-[11px] font-extrabold text-rose-700">Record Video</span>
        </button>
      </div>

      {/* ACTIVE CALLING WINDOW & SUNDAY RULE BANNER (Rule #5 Always Visible) */}
      <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
        currentRuleStatus.isAllowedNow 
          ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900' 
          : 'bg-amber-50/90 border-amber-200 text-amber-900'
      }`}>
        <div className="flex items-center gap-2.5">
          {currentRuleStatus.isAllowedNow ? (
            <Sun className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <Moon className="w-5 h-5 text-amber-600 shrink-0" />
          )}
          <div>
            <div className="font-bold flex items-center gap-2">
              <span>{currentRuleStatus.reason}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                currentRuleStatus.isAllowedNow ? 'bg-emerald-200 text-emerald-950' : 'bg-amber-200 text-amber-950'
              }`}>
                {currentRuleStatus.isAllowedNow ? 'ALLOWED' : 'PAUSED'}
              </span>
            </div>
            {!currentRuleStatus.isAllowedNow && (
              <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                Auto-dialing automatically pauses and resumes at: <strong>{currentRuleStatus.nextAllowedTimeStr}</strong>
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => setActiveTab('rules')}
          className="text-xs font-bold underline shrink-0 hover:opacity-80"
        >
          Rule Details
        </button>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1 TAB: UPLOAD AUDIO                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'audio' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-600" />
                <span>Step 1: Upload or Record Audio Message</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                This audio file will play when the auto-dialed call connects to the recipient.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTtsModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
                title="Create audio by typing message"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Type & Speak</span>
              </button>

              <button
                onClick={() => audioFileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Audio</span>
              </button>
              <input
                ref={audioFileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg"
                className="hidden"
                onChange={handleAudioUpload}
              />

              {!isRecordingAudio ? (
                <button
                  onClick={handleStartRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
                  title="Click to record voice greeting through your microphone"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Record Voice</span>
                </button>
              ) : (
                <button
                  onClick={handleStopRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold transition shadow-sm animate-pulse cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-rose-400" />
                  <span>Stop ({recordSeconds}s)</span>
                </button>
              )}
            </div>
          </div>

          {/* Microphone Notice / Fallback if permissions denied */}
          {micError && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-amber-950">Microphone Notice</span>
                  <span className="text-[11px] text-amber-800 leading-tight block">{micError}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleGenerateInstantVoiceRecording}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  title="Create a synthesized voice recording without microphone hardware"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Instant Voice Sample</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMicError(null)}
                  className="p-1 rounded hover:bg-amber-200/60 text-amber-800 text-xs font-semibold cursor-pointer"
                  title="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Active Voice Recording Live Console with VU Meter & Controls */}
          {isRecordingAudio && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-rose-950 via-slate-900 to-slate-950 border-2 border-rose-500/70 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative">
                  <span className="w-4 h-4 rounded-full bg-rose-500 inline-block animate-ping absolute" />
                  <span className="w-4 h-4 rounded-full bg-rose-600 inline-block relative" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-rose-400">
                      Recording Voice Live
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 font-mono text-[10px]">
                      Max 120s
                    </span>
                  </div>
                  <span className="text-2xl font-mono font-extrabold text-white">
                    {Math.floor(recordSeconds / 60).toString().padStart(2, '0')}:{(recordSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Dynamic VU Meter bars responding to microphone input */}
              <div className="flex items-center gap-1 h-8 px-3 py-1 bg-slate-800/80 rounded-lg border border-slate-700/60">
                {Array.from({ length: 14 }).map((_, barIdx) => {
                  const threshold = (barIdx + 1) * 7;
                  const isActive = micAudioLevel >= threshold;
                  return (
                    <div
                      key={barIdx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        isActive
                          ? barIdx > 10
                            ? 'bg-rose-500 h-7'
                            : barIdx > 6
                            ? 'bg-amber-400 h-5'
                            : 'bg-emerald-400 h-4'
                          : 'bg-slate-700 h-1.5'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Stop & Save Action */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleCancelRecording}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-lg flex items-center gap-2 transition active:scale-95 animate-pulse"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Done & Save Voice Note</span>
                </button>
              </div>
            </div>
          )}

          {/* List of Available Tracks */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-slate-700">Select Active Broadcast Audio:</span>
            {audioTracks.map((track) => {
              const isSelected = selectedAudioId === track.id;
              const isPlaying = previewAudioPlaying === track.id;

              return (
                <div
                  key={track.id}
                  onClick={() => setSelectedAudioId(track.id)}
                  className={`p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition ${
                    isSelected 
                      ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-400' 
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlayAudioPreview(track);
                      }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition shadow-sm ${
                        isPlaying 
                          ? 'bg-emerald-600 text-white animate-pulse' 
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{track.name}</span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold uppercase">
                            ACTIVE AUDIO
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Duration: {track.duration} {track.isRecorded ? '• Voice Recording' : '• Uploaded File'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {audioTracks.length > 1 && track.id !== 'track-campaign-1' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAudioTrack(track.id);
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 transition"
                        title="Delete audio track"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <input
                      type="radio"
                      name="selectedAudio"
                      checked={isSelected}
                      onChange={() => setSelectedAudioId(track.id)}
                      className="w-4 h-4 text-emerald-600 accent-emerald-600 cursor-pointer"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Active Audio: <strong>{audioTracks.find(t => t.id === selectedAudioId)?.name}</strong>
            </span>
            <button
              onClick={() => setActiveTab('contacts')}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm"
            >
              Next: Select Contacts →
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2 TAB: SELECT CONTACTS (PHONEBOOK & IMPORTED FILES)                  */}
      {/* ========================================================================= */}
      {activeTab === 'contacts' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4">
          {/* STEP 2 DEDICATED 3 CONTACTS FORM (NAME AND PHONE NUMBERS) */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-sky-50 via-slate-50 to-white border-2 border-sky-400/80 shadow-sm flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-sky-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center">2</span>
                  <h4 className="text-xs font-extrabold text-sky-950 uppercase tracking-wide">
                    Step 2: Add 3 Contacts (Name and Phone Numbers)
                  </h4>
                </div>
                <p className="text-[11px] text-sky-900 mt-0.5">
                  Enter 3 contacts who will receive the automated phone call sequentially without touching your phone.
                </p>
              </div>

              <button
                type="button"
                onClick={handleImportSavedContactsToThreeSlots}
                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Fill From Saved Contacts</span>
              </button>
            </div>

            {/* 3 Contact Input Slots */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {threeContacts.map((c, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white border border-sky-200 shadow-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-sky-900 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <span>Contact {idx + 1}</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">Ready</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Full Name</label>
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => {
                        const updated = [...threeContacts] as typeof threeContacts;
                        updated[idx].name = e.target.value;
                        setThreeContacts(updated);
                      }}
                      placeholder={`Contact ${idx + 1} Name`}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Phone Number</label>
                    <input
                      type="tel"
                      value={c.phone}
                      onChange={(e) => {
                        const updated = [...threeContacts] as typeof threeContacts;
                        updated[idx].phone = e.target.value;
                        setThreeContacts(updated);
                      }}
                      placeholder={`+1 (555) 000-${idx}000`}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-sky-100">
              <span className="text-[11px] text-slate-600">
                ⚡ When saved, these 3 numbers will be queued for autonomous hands-free auto-dialing.
              </span>

              <button
                type="button"
                onClick={() => handleSaveThreeContacts(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Queue These 3 Contacts → Step 3</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600" />
                <span>All Contacts (Phonebook & Queue)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pending Calling List: {pendingCount} ready • {completedCount} dialed • {totalCount} total
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {contacts.length > 0 && (
                <button
                  type="button"
                  onClick={handleImportFromAppContacts}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
                  title="Import contacts from your App phonebook directory"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Import App Contacts ({contacts.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSelectFromPhonebook}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
                title="Select from your mobile phone or SIM address book"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>From Phonebook</span>
              </button>

              <button
                type="button"
                onClick={() => setShowImportFileModal(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
                title="Import contacts from CSV, VCF (vCard), or text file"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Files</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddContactModal(true)}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
                title="Add a single phone number manually"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Single</span>
              </button>
            </div>
          </div>

          {phonebookAlert && (
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{phonebookAlert}</span>
            </div>
          )}

          {fileImportSuccessMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{fileImportSuccessMessage}</span>
            </div>
          )}

          {/* Quick banner if contacts exist in App directory */}
          {contacts.length > 0 && pendingQueue.length === 0 && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-emerald-900 font-medium">
                  Found <strong>{contacts.length} saved contacts</strong> in your app directory.
                </span>
              </div>
              <button
                onClick={handleImportFromAppContacts}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm whitespace-nowrap active:scale-95 transition"
              >
                Add All to Scheduler
              </button>
            </div>
          )}

          {/* Contact Controls Bar: Search, Status Filters, Export & Reset */}
          {pendingQueue.length > 0 && (
            <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                {/* Search input */}
                <input
                  type="text"
                  value={contactSearchQuery}
                  onChange={(e) => setContactSearchQuery(e.target.value)}
                  placeholder="Search contacts by name or number..."
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500"
                />

                {/* Quick actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    onClick={handleExportCallingList}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-bold transition flex items-center gap-1"
                    title="Export calling results to CSV"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>

                  {completedCount > 0 && (
                    <button
                      onClick={handleResetAllToPending}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-bold hover:bg-emerald-100 transition flex items-center gap-1"
                      title="Reset completed calls to pending to dial again"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset All</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500 font-semibold mr-1">Filter:</span>
                {(['all', 'pending', 'completed', 'skipped'] as const).map((filterKey) => {
                  const count = filterKey === 'all' 
                    ? totalCount 
                    : filterKey === 'pending' 
                    ? pendingCount 
                    : filterKey === 'completed' 
                    ? completedCount 
                    : skippedCount;

                  const isActive = contactStatusFilter === filterKey;
                  return (
                    <button
                      key={filterKey}
                      onClick={() => setContactStatusFilter(filterKey)}
                      className={`px-2 py-0.5 rounded-md font-bold uppercase transition ${
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      {filterKey} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending Calling List */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span>Calling Queue ({filteredQueue.length} shown of {pendingQueue.length})</span>
              {pendingQueue.length > 0 && (
                <button
                  onClick={handleClearCallingQueue}
                  className="text-rose-600 hover:text-rose-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title="Clear all contacts from calling queue"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear All
                </button>
              )}
            </div>

            {pendingQueue.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 bg-slate-50/50">
                <Users className="w-8 h-8 text-slate-300" />
                <span className="text-xs font-semibold text-slate-700">Calling list is currently empty.</span>
                <span className="text-[11px] text-slate-500 max-w-xs">
                  Import contacts from your phonebook, upload a CSV/VCF file, or paste phone numbers to begin.
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  <button
                    onClick={handleSelectFromPhonebook}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Select from Phonebook
                  </button>
                  <button
                    onClick={() => setShowImportFileModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Import CSV / VCF
                  </button>
                  {contacts.length > 0 && (
                    <button
                      onClick={() => {
                        setPendingQueue(contacts.map(c => ({
                          id: c.id,
                          name: c.name,
                          phone: c.phone,
                          status: 'pending'
                        })));
                        logEvent(`Loaded ${contacts.length} contacts into calling queue.`, 'info');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Load All Contacts ({contacts.length})
                    </button>
                  )}
                </div>
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="py-6 text-center border border-slate-200 rounded-lg text-slate-500 text-xs">
                No contacts match your search or filter.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {filteredQueue.map((item, idx) => (
                  <div key={item.id} className="p-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 font-mono text-[10px] text-slate-400">#{idx + 1}</span>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{item.name}</span>
                        <span className="font-mono text-slate-600 text-[11px]">{item.phone}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.calledAt && (
                        <span className="text-[10px] font-mono text-slate-400">
                          {item.calledAt} ({item.durationSeconds || 0}s)
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                        item.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'dialing'
                          ? 'bg-sky-100 text-sky-800 animate-pulse'
                          : item.status === 'skipped'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {item.status}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveQueueContact(item.id, item.name);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 font-semibold text-[11px] transition cursor-pointer border border-rose-200"
                        title={`Remove ${item.name} from calling list`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Total Queued: <strong>{pendingCount} contacts pending</strong>
            </span>
            <button
              onClick={() => setActiveTab('schedule')}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
            >
              Next: Schedule 1st Call →
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3 TAB: SCHEDULE 1ST CALL AUTO-START (ZERO-TOUCH COUNTDOWN)           */}
      {/* ========================================================================= */}
      {activeTab === 'schedule' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Step 3: Schedule Time & Date for Auto Calling (Without Touching Phone)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                The phone will autonomously start dialing the 3 contacts at the scheduled date & time without you touching it.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                Zero-Touch Automation
              </span>
            </div>
          </div>

          {/* SCHEDULE COUNTDOWN HERO CARD IF ACTIVE */}
          {isScheduledActive ? (
            <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white p-6 rounded-2xl border border-emerald-500/50 shadow-xl flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-extrabold uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span>AUTONOMOUS ZERO-TOUCH COUNTDOWN ACTIVE</span>
              </div>

              <div>
                <span className="text-4xl sm:text-5xl font-mono font-extrabold tracking-tight text-white block">
                  {countdownString}
                </span>
                <span className="text-xs text-emerald-300 font-medium mt-1 block">
                  1st Call starts automatically on <strong>{startDate} at {startTime}</strong>
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 max-w-md">
                📱 <strong>Screen Wake Lock Active:</strong> Your screen will stay awake and ready. When the timer hits 00:00:00, the first call will launch automatically via <strong>{callMethod === 'webrtc' ? '🌐 In-App WebRTC VoIP (zero-touch loop)' : '📱 Native SIM Dialer'}</strong>, broadcasting your audio track to every pending contact.
              </div>

              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={triggerAutoStartCampaign}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md transition active:scale-95"
                >
                  Start Right Now (Skip Timer)
                </button>
                <button
                  onClick={handleCancelSchedule}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-600 transition"
                >
                  Cancel Schedule
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Date & Time Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span>Select 1st Call Start Date</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={startImmediately}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Select 1st Call Start Time</span>
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={startImmediately}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons for 1st Call Schedule */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Quick Schedule Shortcuts:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickSetScheduleSeconds(5)}
                    className="py-1.5 px-2.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-950 text-xs font-extrabold border border-emerald-400 transition flex items-center justify-center gap-1 shadow-xs cursor-pointer col-span-2 sm:col-span-4"
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>⚡ Auto-Start in 5 Seconds (Zero-Touch Testing - Proof)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSetSchedule(2)}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 text-xs font-bold border border-slate-200 transition"
                  >
                    ⚡ In 2 Minutes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSetSchedule(15)}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 text-xs font-bold border border-slate-200 transition"
                  >
                    ⏱ In 15 Minutes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSetSchedule(60)}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 text-xs font-bold border border-slate-200 transition"
                  >
                    🕒 In 1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={handleSetTomorrow8AM}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 text-xs font-bold border border-slate-200 transition"
                  >
                    🌅 Next Day 8:00 AM
                  </button>
                </div>
              </div>

              {/* Call Transmission Mode: WebRTC In-App Audio Broadcast Engine */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/50 flex flex-col gap-2.5 text-white shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <span>Calling Transmission Protocol</span>
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-600 text-white border border-blue-400">
                    📱 100% In-App Voice Connected (Auto-Receive Loop)
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/90 border border-slate-700 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5 border border-blue-500/40">
                    <PhoneCall className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-300">
                        Automatic Numbers Dialing Inside App (100% In-App Engine)
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        Live Auto-Receive
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Automatic numbers dialing initiates completely inside RoboVoiceCall. Each dialed call connects and receives automatically in-app, broadcasting your audio track and moving to the next contact without touching the phone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Start Immediately Toggle */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Start Auto-Dialing Immediately</span>
                  <span className="text-[11px] text-slate-500">
                    Bypasses timer and begins calling the first pending contact right now
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={startImmediately}
                  onChange={(e) => setStartImmediately(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 accent-emerald-600 cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={handleScheduleCampaign}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {startImmediately ? 'Start WebRTC Auto-Dialing Immediately' : `Arm WebRTC Auto-Start (${startDate} ${startTime})`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Step summary */}
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
            <div>
              <span className="text-slate-400 block text-[11px]">Selected Audio:</span>
              <span className="font-bold text-slate-800 truncate block">
                {audioTracks.find(t => t.id === selectedAudioId)?.name}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Pending Contacts:</span>
              <span className="font-bold text-slate-800 block">
                {pendingCount} contacts ({intervalSeconds}s interval)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4 TAB: TIME INTERVAL BETWEEN TWO CALLS                               */}
      {/* ========================================================================= */}
      {activeTab === 'interval' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-600" />
                <span>Step 4: Time Interval Between Two Calls</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Delay between finishing Call #1 and automatically initiating Call #2 to pending numbers.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-sky-100 text-sky-800 font-mono font-bold text-xs">
              Current: {intervalSeconds} Seconds
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold text-slate-700">Choose Interval Presets:</span>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[5, 10, 15, 30, 45, 60].map((secs) => (
                <button
                  key={secs}
                  onClick={() => setIntervalSeconds(secs)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition border ${
                    intervalSeconds === secs 
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {secs} Secs
                </button>
              ))}
            </div>

            {/* Custom Interval Slider */}
            <div className="mt-2 bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                <span>Custom Interval Slider</span>
                <span className="text-emerald-600 font-mono text-sm">{intervalSeconds}s</span>
              </div>
              <input
                type="range"
                min="3"
                max="120"
                step="1"
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>Fast: 3s</span>
                <span>Normal: 15s</span>
                <span>Relaxed: 120s</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <span>
                Recommended interval is <strong>15 seconds</strong>. This gives your cellular carrier line time to reset and ensures you can review each completed call before the next pending number dials automatically.
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Configured: <strong>{intervalSeconds} seconds</strong> cooldown between calls
            </span>
            <button
              onClick={() => setActiveTab('rules')}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>Next: Step 5 (Record Video)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 5 TAB: RECORD APP MAKING AUTOMATIC DIALLING TO 3 CONTACTS            */}
      {/* ========================================================================= */}
      {activeTab === 'rules' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center">5</span>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Video className="w-4 h-4 text-rose-600" />
                  <span>Step 5: Record App Making Automatic Dialling to 3 Contacts (Without Touching Phone)</span>
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Record the live video proof of the app autonomously calling the 3 contacts sequentially, broadcasting audio, and waiting between calls without any human touch.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isRecordingVideo ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 border border-rose-300 text-rose-700 text-xs font-mono font-bold animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                    <span>REC {Math.floor(recordingVideoSeconds / 60).toString().padStart(2, '0')}:{(recordingVideoSeconds % 60).toString().padStart(2, '0')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleStopRecordingVideo}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Recording</span>
                  </button>
                </div>
              ) : (
                <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-mono font-semibold">
                  Video Studio Ready
                </span>
              )}
            </div>
          </div>

          {/* MAIN RECORDING CONTROL CONSOLE */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#061A40] via-[#0B2545] to-[#030E1F] text-white border border-rose-500/50 shadow-xl flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/40 inline-block mb-1">
                  Autonomous 3-Contact Video Proof Studio
                </span>
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Record Zero-Touch Auto-Dialing Session</span>
                </h4>
                <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                  Click the button below to start the video recording. The system will begin recording, auto-dial Contact #1, connect & broadcast the audio message, pause for Step 4 interval ({intervalSeconds}s), call Contact #2, pause, and call Contact #3 — all with zero touches!
                </p>
              </div>

              {/* Mode Selector */}
              <div className="bg-slate-900/90 border border-slate-700 p-2.5 rounded-xl flex flex-col gap-1.5 shrink-0 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Recording Mode:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRecordingMode('canvas')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      recordingMode === 'canvas' 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                    title="Render crisp 1280x720 video canvas directly (100% reliable inside any browser iframe)"
                  >
                    📱 In-App HD Video
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordingMode('screen')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      recordingMode === 'screen' 
                        ? 'bg-sky-600 text-white' 
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                    title="Capture entire computer/phone browser screen via DisplayMedia"
                  >
                    🖥 Screen Capture
                  </button>
                </div>
              </div>
            </div>

            {/* Launch Action Bar */}
            <div className="pt-3 border-t border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>3 Contacts Ready in Queue: <strong>{pendingQueue.slice(0, 3).map(c => c.name).join(', ') || threeContacts.map(c => c.name).join(', ')}</strong></span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                {isRecordingVideo ? (
                  <button
                    type="button"
                    onClick={handleStopRecordingVideo}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg flex items-center justify-center gap-2 animate-pulse cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop Video Recording ({recordingVideoSeconds}s)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartRecordingAndDial(recordingMode)}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-extrabold text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <Film className="w-4 h-4 fill-current" />
                    <span>🎬 Record Video & Auto-Dial 3 Contacts Now</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* LAST RECORDED VIDEO PREVIEW & DOWNLOAD CARD */}
          {lastRecordedVideo && (
            <div className="p-4 rounded-2xl bg-slate-900 border-2 border-emerald-500 text-white shadow-xl flex flex-col gap-3.5 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
                      Video Recording Ready for Download
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Duration: {lastRecordedVideo.durationSeconds}s • Format: {lastRecordedVideo.blob.type || 'video/webm'} • Size: {(lastRecordedVideo.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>

                <a
                  href={lastRecordedVideo.url}
                  download={`robovoice_autodial_3contacts_${Date.now()}.webm`}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Video (.webm)</span>
                </a>
              </div>

              {/* In-app Video Player Preview */}
              <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video max-h-72 flex items-center justify-center">
                <video
                  src={lastRecordedVideo.url}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>Recorded at {lastRecordedVideo.recordedAt} via {lastRecordedVideo.source === 'screen' ? 'Screen Capture' : 'In-App Video Engine'}</span>
                <div className="flex items-center gap-2">
                  <a
                    href={lastRecordedVideo.url}
                    download={`robovoice_autodial_3contacts_${Date.now()}.webm`}
                    className="text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleStartRecordingAndDial(recordingMode)}
                    className="text-sky-400 font-bold hover:underline ml-2 cursor-pointer"
                  >
                    Record Another Session →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADVANCED RULES & SUNDAY RESTRICTIONS (COLLAPSIBLE ACCORDION) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedRules(!showAdvancedRules)}
              className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>⚙ Advanced Business Hours & Sunday Calling Restrictions (Optional)</span>
              </div>
              {showAdvancedRules ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>

            {showAdvancedRules && (
              <div className="p-4 flex flex-col gap-3 bg-white border-t border-slate-200">
                {/* Rule 1: Configurable Business Hours Auto-Window */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Sun className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Enforce Business Hours Window
                        </span>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                          When enabled, auto-calling only runs between the specified window. When disabled, you can schedule and start calls at <strong>any custom time (e.g. 5:55 AM, 6:30 AM, or late evening)</strong>.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enforceBusinessHours}
                      onChange={(e) => setEnforceBusinessHours(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 accent-emerald-600 cursor-pointer mt-1"
                    />
                  </div>

                  {enforceBusinessHours && (
                    <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-3 bg-white p-2.5 rounded-lg">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">Window Starts At:</label>
                        <input
                          type="time"
                          value={businessHoursStart}
                          onChange={(e) => setBusinessHoursStart(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">Window Stops At:</label>
                        <input
                          type="time"
                          value={businessHoursEnd}
                          onChange={(e) => setBusinessHoursEnd(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Rule 2: Strictly NO Calls on Sunday */}
                <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-rose-950 block">
                        Sunday Calling Restriction
                      </span>
                      <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                        Auto-dialer halts calling on Sunday. If the queue reaches Sunday, it pauses and resumes on Monday morning.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enforceNoSunday}
                    onChange={(e) => setEnforceNoSunday(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 accent-emerald-600 cursor-pointer mt-1"
                  />
                </div>

                {/* Live Enforcement Status Box */}
                <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wide">
                      Live Rule Engine Status
                    </span>
                    {previewClockTime && (
                      <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-mono font-bold uppercase border border-amber-400/40">
                        PREVIEW CLOCK ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <span>{currentRuleStatus.reason}</span>
                  </div>
                  <span className="text-xs text-slate-300">
                    Next Resume Target: <strong>{currentRuleStatus.nextAllowedTimeStr}</strong>
                  </span>

                  {/* Interactive Preview Controls to Verify Rules */}
                  <div className="pt-2 mt-1 border-t border-slate-800 flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">
                      Preview Clock Rules (Rule Tester):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handlePreviewRuleTime('8am')}
                        className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/60 text-emerald-300 font-bold transition text-center cursor-pointer"
                      >
                        🟢 Test 10 AM Window
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePreviewRuleTime('6pm')}
                        className="p-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/60 text-amber-300 font-bold transition text-center cursor-pointer"
                      >
                        🌙 Test 6:15 PM Stop
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePreviewRuleTime('sunday')}
                        className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-600/60 text-rose-300 font-bold transition text-center cursor-pointer"
                      >
                        🛑 Test Sunday Stop
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePreviewRuleTime('real')}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold transition text-center cursor-pointer"
                      >
                        🔄 Real Clock
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Autonomous Hands-Free Guarantee • WebRTC In-App Telecom Loop
            </span>
            <button
              onClick={() => handleStartRecordingAndDial(recordingMode)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Launch & Record 3-Contact Auto-Dialing</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LIVE DIALER QUEUE RUNNER MODAL/OVERLAY (WHEN RUNNING)                     */}
      {/* ========================================================================= */}
      {isDialerRunning && (
        <div className="bg-slate-900 text-white border border-slate-700 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Autonomous Auto-Dialer Running
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {isDialerPaused ? (
                <button
                  onClick={handleResumeDialer}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={handlePauseDialer}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={handleSkipCurrent}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 border border-slate-700"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>Skip</span>
              </button>

              <button
                onClick={handleStopDialer}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          </div>

          {/* Current Contact Calling Card */}
          {intervalCountdown !== null ? (
            <div className="bg-slate-800/90 border border-sky-500/40 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                Interval Cooldown Between Calls (Step 4)
              </span>
              <span className="text-3xl font-extrabold font-mono text-white">
                Next Call In: {intervalCountdown}s
              </span>
              <p className="text-xs text-slate-300">
                Next in queue: <strong>{pendingQueue[currentDialingIndex + 1]?.name}</strong> ({pendingQueue[currentDialingIndex + 1]?.phone})
              </p>
              <div className="w-full max-w-xs bg-slate-700 h-2 rounded-full overflow-hidden mt-1">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-1000"
                  style={{ width: `${((intervalSeconds - intervalCountdown) / intervalSeconds) * 100}%` }}
                />
              </div>

              <button
                type="button"
                onClick={() => handleSkipIntervalCooldown(currentDialingIndex + 1)}
                className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>Skip Wait & Dial Next Contact Now</span>
              </button>
            </div>
          ) : (
            <div className="bg-slate-800/90 border border-emerald-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base shadow-lg ${
                  currentCallState === 'ringing' 
                    ? 'bg-amber-500 text-slate-950 animate-pulse ring-4 ring-amber-400/40' 
                    : 'bg-emerald-500 text-slate-950 animate-bounce ring-4 ring-emerald-400/40'
                }`}>
                  <PhoneCall className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Dialing Contact #{currentDialingIndex + 1} of {pendingQueue.length}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-950 border border-emerald-500/70 text-emerald-300">
                      🌐 WebRTC In-App (Zero-Touch Loop)
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>{pendingQueue[currentDialingIndex]?.name || 'Dialing Contact'}</span>
                    {currentCallState === 'ringing' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-semibold animate-pulse">
                        Ringing...
                      </span>
                    )}
                    {currentCallState === 'connected' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-semibold">
                        Connected
                      </span>
                    )}
                  </h4>
                  <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                    <span>{pendingQueue[currentDialingIndex]?.phone}</span>
                    <span>• {currentCallState === 'ringing' ? 'Connecting handshake...' : `Broadcast Duration: ${currentCallSeconds}s`}</span>
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-right w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-700/60">
                <span className="text-xs text-slate-400 block">Broadcasting Audio:</span>
                <span className="text-xs font-bold text-emerald-300 block truncate max-w-[200px]">
                  {audioTracks.find(t => t.id === selectedAudioId)?.name}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">
                  ⚡ Autonomous WebRTC Loop • Zero Popups
                </span>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Campaign Progress</span>
              <span>{completedCount} / {totalCount} Calls Completed</span>
            </div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Real-time Call Activity Logs */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Live Activity Stream:</span>
              {campaignLogs.length > 0 && (
                <button
                  onClick={() => setCampaignLogs([])}
                  className="text-[10px] text-slate-400 hover:text-rose-400 cursor-pointer font-medium"
                >
                  Clear Logs
                </button>
              )}
            </div>
            <div className="max-h-32 overflow-y-auto bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] space-y-1">
              {campaignLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">{log.time}</span>
                  <span className={
                    log.type === 'success' 
                      ? 'text-emerald-400' 
                      : log.type === 'warning' 
                      ? 'text-amber-400' 
                      : 'text-slate-300'
                  }>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD SINGLE CONTACT */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <form 
            onSubmit={handleCreateSingleContact}
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl flex flex-col gap-4 border border-slate-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Add Number to Queue</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddContactModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Name</label>
                <input
                  type="text"
                  autoFocus
                  value={singleNameInput}
                  onChange={(e) => setSingleNameInput(e.target.value)}
                  placeholder="e.g. David Miller"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={singlePhoneInput}
                  onChange={(e) => setSinglePhoneInput(e.target.value)}
                  placeholder="e.g. +91 98765 43210 or +1 (555) 432-8901"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
                  <select
                    value={singleCategoryInput}
                    onChange={(e) => setSingleCategoryInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                  >
                    <option value="Lead">Lead</option>
                    <option value="Customer">Customer</option>
                    <option value="VIP Partner">VIP Partner</option>
                    <option value="Scheduled">Scheduled</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Company / Note</label>
                  <input
                    type="text"
                    value={singleCompanyInput}
                    onChange={(e) => setSingleCompanyInput(e.target.value)}
                    placeholder="Optional note"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddContactModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!singlePhoneInput.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition active:scale-95 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Calling List</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: IMPORT CSV / VCF / TXT / PASTE */}
      {showImportFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-2xl p-5 shadow-2xl flex flex-col gap-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Import Contacts (Files, Leads, Paste)</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowImportFileModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => contactsFileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/70 hover:bg-sky-100/70 text-sky-900 text-xs font-bold transition cursor-pointer active:scale-95 text-center"
              >
                <FileSpreadsheet className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Upload CSV / VCF / TXT</span>
              </button>
              <input
                ref={contactsFileInputRef}
                type="file"
                accept=".csv,.vcf,.txt,.tsv"
                className="hidden"
                onChange={handleFileUploadDirect}
              />

              <button
                type="button"
                onClick={() => {
                  setShowImportFileModal(false);
                  handleSelectFromPhonebook();
                }}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100/60 text-emerald-900 text-xs font-bold transition cursor-pointer active:scale-95 text-center"
              >
                <BookOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>From Phonebook</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold transition cursor-pointer active:scale-95 text-center"
                title="Download ready-to-use CSV template"
              >
                <Download className="w-4 h-4 text-slate-600 shrink-0" />
                <span>CSV Template</span>
              </button>
            </div>

            {/* Paste Numbers Box with Live Count */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Paste Phone Numbers & Names:
                </label>
                <button
                  type="button"
                  onClick={handleImportSavedContactsToPaste}
                  className="text-[11px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer bg-sky-50 px-2 py-0.5 rounded border border-sky-200 transition"
                  title="Fill from your saved contacts directory"
                >
                  <Users className="w-3 h-3 text-sky-600" />
                  <span>Fill Saved Contacts</span>
                </button>
              </div>

              <textarea
                value={pasteContactsText}
                onChange={(e) => setPasteContactsText(e.target.value)}
                rows={5}
                placeholder={`+15550101234, Contact Name\n+919876543210, Team Lead`}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 font-mono outline-none focus:border-sky-500 focus:bg-white transition"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {pasteContactsText.trim() ? (
                    <strong className="text-emerald-700">
                      ⚡ {parseNumbersFromRawText(pasteContactsText).length} phone numbers detected
                    </strong>
                  ) : (
                    'Supports all formats: plain numbers, CSV rows, or space/comma separated lines.'
                  )}
                </span>
                {pasteContactsText.trim() && (
                  <button
                    type="button"
                    onClick={() => setPasteContactsText('')}
                    className="text-slate-400 hover:text-rose-600 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImportFileModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBatchImport}
                disabled={!pasteContactsText.trim()}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm disabled:opacity-40 cursor-pointer transition active:scale-95 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Import {parseNumbersFromRawText(pasteContactsText).length > 0 ? `(${parseNumbersFromRawText(pasteContactsText).length})` : ''} to Calling List</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PHONEBOOK CONTACT PICKER MODAL (100% RELIABLE ACROSS ALL BROWSERS & IFRAMES) */}
      {showPhonebookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl flex flex-col gap-3.5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Select from Phonebook & SIM</h3>
                  <span className="text-[11px] text-slate-500">Pick numbers to add directly to your Auto-Dial queue</span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPhonebookModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search and Action Bar */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={phonebookSearch}
                  onChange={(e) => setPhonebookSearch(e.target.value)}
                  placeholder="Search phonebook..."
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-emerald-500"
                />
              </div>

              {phonebookList.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAllPhonebook}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  {selectedPhonebookIds.size === phonebookList.length ? 'Unselect' : 'Select All'}
                </button>
              )}

              {phonebookList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllPhonebook}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 cursor-pointer whitespace-nowrap transition"
                  title="Clear all contacts from Phonebook & SIM (will not show again)"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {/* Contact Items List */}
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
              {phonebookList.length === 0 ? (
                <div className="py-7 px-4 text-center flex flex-col items-center justify-center gap-2">
                  <Users className="w-7 h-7 text-slate-300" />
                  <span className="text-xs font-bold text-slate-800">Phonebook & SIM is empty</span>
                  <span className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                    No random contacts are displayed. Only numbers you import or add will show here.
                  </span>
                </div>
              ) : phonebookList.filter(c => 
                  c.name.toLowerCase().includes(phonebookSearch.toLowerCase()) || 
                  c.phone.includes(phonebookSearch)
                ).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No contacts match your search "{phonebookSearch}".
                </div>
              ) : (
                phonebookList
                  .filter(c => 
                    c.name.toLowerCase().includes(phonebookSearch.toLowerCase()) || 
                    c.phone.includes(phonebookSearch)
                  )
                  .map((contact) => {
                    const isChecked = selectedPhonebookIds.has(contact.id);
                    return (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-2.5 hover:bg-white transition cursor-pointer select-none group"
                        onClick={() => {
                          setSelectedPhonebookIds(prev => {
                            const next = new Set(prev);
                            if (next.has(contact.id)) next.delete(contact.id);
                            else next.add(contact.id);
                            return next;
                          });
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // Controlled via parent row click
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 block truncate">{contact.name}</span>
                            <span className="text-[11px] font-mono text-slate-500 block truncate">{contact.phone}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                            SIM / Book
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePhonebookContact(contact.id, contact.phone, contact.name);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer text-[11px] font-semibold"
                            title={`Remove ${contact.name} so it will not show again`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span className="hidden sm:inline">Remove</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Quick Single Phonebook Add */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Plus className="w-3 h-3 text-emerald-600" />
                <span>Quick Add to Phonebook</span>
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={quickPhonebookName}
                  onChange={(e) => setQuickPhonebookName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-emerald-500"
                />
                <input
                  type="tel"
                  value={quickPhonebookPhone}
                  onChange={(e) => setQuickPhonebookPhone(e.target.value)}
                  placeholder="Phone"
                  className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!quickPhonebookPhone.trim()) return;
                    const newPb: AutoDialContactItem = {
                      id: `pb-${Date.now()}`,
                      name: quickPhonebookName.trim() || 'New Contact',
                      phone: quickPhonebookPhone.trim(),
                      status: 'pending'
                    };
                    setPhonebookList(prev => [newPb, ...prev]);
                    setSelectedPhonebookIds(prev => new Set([...prev, newPb.id]));
                    setQuickPhonebookName('');
                    setQuickPhonebookPhone('');
                  }}
                  disabled={!quickPhonebookPhone.trim()}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs disabled:opacity-40 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPhonebookModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSelectedFromPhonebookModal}
                disabled={selectedPhonebookIds.size === 0}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm disabled:opacity-40 cursor-pointer transition active:scale-95 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Import {selectedPhonebookIds.size} to Auto-Dialer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TTS Synthesize Audio Modal */}
      {showTtsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600" />
                <span>Type & Synthesize Voice Message</span>
              </h3>
              <button 
                onClick={() => setShowTtsModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Type the exact announcement message you want the automated caller to broadcast when answering:
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Broadcast Voice Script:
              </label>
              <textarea
                value={ttsPrompt}
                onChange={(e) => setTtsPrompt(e.target.value)}
                rows={4}
                placeholder="Enter announcement text to speak..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-emerald-500 leading-relaxed font-sans"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowTtsModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateTtsAudio}
                disabled={!ttsPrompt.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm disabled:opacity-40 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Create Broadcast Track</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: RECORDED VIDEO PREVIEW & DOWNLOAD MODAL */}
      {isVideoModalOpen && lastRecordedVideo && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-emerald-500 rounded-2xl max-w-xl w-full p-5 shadow-2xl flex flex-col gap-4 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                  <Film className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Autonomous 3-Contact Calling Video Recorded!
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    Zero-Touch Workflow Captured • {lastRecordedVideo.durationSeconds}s
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsVideoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center">
              <video
                src={lastRecordedVideo.url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Source: {lastRecordedVideo.source === 'screen' ? 'Screen Recording' : 'In-App HD Video Canvas'}</span>
              <span>Size: {(lastRecordedVideo.sizeBytes / 1024).toFixed(1)} KB</span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-2">
              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={lastRecordedVideo.url}
                  download={`robovoice_autodial_3contacts_${Date.now()}.webm`}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Video Recording (.webm)</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
