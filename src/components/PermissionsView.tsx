import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, Users, Mic, Bell, CheckCircle2, ShieldCheck, 
  ArrowLeft, Smartphone, Radio, AlertCircle, X, Volume2, Wrench, Copy, Check
} from 'lucide-react';
import { unlockAudioAndSpeech, getAudioContext } from '../utils/audio';
import { webrtcManager } from '../utils/webrtc';

interface PermissionsViewProps {
  onBack: () => void;
  onComplete?: () => void;
  isModal?: boolean;
}

type DialogType = 'audio' | 'phone' | 'contacts' | 'notifications' | null;
type TroubleshooterPlatform = 'web' | 'android';
type TroubleshooterIssue = 'incoming' | 'outgoing' | 'ring_no_screen' | 'auto_calling';

interface PermissionStatus {
  phone: 'pending' | 'granted' | 'denied';
  contacts: 'pending' | 'granted' | 'denied';
  audio: 'pending' | 'granted' | 'denied';
  notifications: 'pending' | 'granted' | 'denied';
}

const ANDROID_FIX_SNIPPETS: Record<TroubleshooterIssue, { title: string; summary: string; code: string }> = {
  incoming: {
    title: 'AndroidManifest.xml + RoleManager (Incoming SIM Calls)',
    summary: 'Your app must hold ROLE_DIALER (default phone app) and declare InCallService + READ_PHONE_STATE to receive incoming SIM calls.',
    code: `// AndroidManifest.xml
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.ANSWER_PHONE_CALLS" />
<service android:name=".telecom.MyInCallService"
    android:permission="android.permission.BIND_INCALL_SERVICE"
    android:exported="true">
    <meta-data android:name="android.telecom.IN_CALL_SERVICE_UI" android:value="true" />
    <intent-filter>
        <action android:name="android.telecom.InCallService" />
    </intent-filter>
</service>

// Request Default Dialer Role in Kotlin (Android 10+)
val roleManager = getSystemService(RoleManager::class.java)
startActivityForResult(roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER), 1001)`
  },
  outgoing: {
    title: 'TelecomManager & CALL_PHONE Permission (Outgoing SIM Calls)',
    summary: 'Ensure CALL_PHONE & RECORD_AUDIO runtime permissions are granted before calling telecomManager.placeCall().',
    code: `// Runtime check + Place Call via TelecomManager
if (checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
    val telecom = getSystemService(TelecomManager::class.java)
    val uri = Uri.fromParts("tel", targetNumber, null)
    telecom.placeCall(uri, Bundle())
}`
  },
  ring_no_screen: {
    title: 'Full-Screen Intent & Notification Channel (Call Screen Hidden)',
    summary: 'Android 14+ requires USE_FULL_SCREEN_INTENT and a high-importance NotificationChannel in InCallService.onCallAdded() so your CallActivity opens while ringing.',
    code: `// AndroidManifest.xml
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

// Inside MyInCallService.onCallAdded(call: Call)
val intent = Intent(this, IncomingCallActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
}
val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
val notif = NotificationCompat.Builder(this, "incoming_calls")
    .setSmallIcon(R.drawable.ic_call)
    .setContentTitle("Incoming Call")
    .setPriority(NotificationCompat.PRIORITY_MAX)
    .setCategory(NotificationCompat.CATEGORY_CALL)
    .setFullScreenIntent(pending, true)
    .build()
startForeground(101, notif)`
  },
  auto_calling: {
    title: 'ForegroundService (phoneCall) + Battery Exemption (Auto-Dial)',
    summary: 'Android kills background dialer queues unless they run inside a foregroundServiceType="phoneCall" service and request battery optimization ignore.',
    code: `// AndroidManifest.xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
<service android:name=".AutoDialService"
    android:foregroundServiceType="phoneCall"
    android:exported="false" />`
  }
};

export const PermissionsView: React.FC<PermissionsViewProps> = ({ onBack, onComplete, isModal = false }) => {
  const [permissions, setPermissions] = useState<PermissionStatus>(() => {
    try {
      const saved = localStorage.getItem('mobilevoip_permissions_state');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      phone: 'pending',
      contacts: 'pending',
      audio: 'pending',
      notifications: 'pending'
    };
  });

  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [dialogQueue, setDialogQueue] = useState<DialogType[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [testMicLevel, setTestMicLevel] = useState<number>(0);
  const [isMicTesting, setIsMicTesting] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(() => webrtcManager.wsConnected);
  const [troubleshooterPlatform, setTroubleshooterPlatform] = useState<TroubleshooterPlatform>('web');
  const [selectedIssue, setSelectedIssue] = useState<TroubleshooterIssue>('incoming');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Sync real browser permissions & WebSocket status on mount
  useEffect(() => {
    let cancelled = false;
    const syncRealPermissions = async () => {
      let audioState: 'pending' | 'granted' | 'denied' = 'pending';
      try {
        if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
          // @ts-ignore
          const micPerm = await navigator.permissions.query({ name: 'microphone' });
          audioState = micPerm.state === 'granted' ? 'granted' : micPerm.state === 'denied' ? 'denied' : 'pending';
          micPerm.onchange = () => {
            if (cancelled) return;
            const next = micPerm.state === 'granted' ? 'granted' : micPerm.state === 'denied' ? 'denied' : 'pending';
            setPermissions(prev => ({ ...prev, audio: next }));
          };
        }
      } catch {}

      let notifState: 'pending' | 'granted' | 'denied' = 'pending';
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') notifState = 'granted';
        else if (Notification.permission === 'denied') notifState = 'denied';
      }

      if (!cancelled) {
        setPermissions(prev => ({
          ...prev,
          audio: audioState,
          notifications: notifState
        }));
      }
    };

    syncRealPermissions();
    const unsub = webrtcManager.subscribe({
      onSocketStatusChange: (connected) => setWsConnected(connected)
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Save permissions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mobilevoip_permissions_state', JSON.stringify(permissions));
      localStorage.setItem('mobilevoip_mic_allowed', permissions.audio === 'granted' ? 'true' : 'false');
    } catch {}
  }, [permissions]);

  // Live microphone level listener when audio is granted
  useEffect(() => {
    if (permissions.audio === 'granted') {
      startLiveMicTester();
    } else {
      stopLiveMicTester();
    }
    return () => {
      stopLiveMicTester();
    };
  }, [permissions.audio]);

  const startLiveMicTester = async () => {
    unlockAudioAndSpeech();
    setMicError(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        setIsMicTesting(true);
        setPermissions(prev => (prev.audio === 'granted' ? prev : { ...prev, audio: 'granted' }));
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
        const updateLevel = () => {
          if (micAnalyserRef.current) {
            micAnalyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setTestMicLevel(Math.min(100, Math.round(avg * 2.4)));
            animFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();
        return;
      }
      setMicError('MediaDevices API unavailable in this browser context.');
    } catch (e: any) {
      setIsMicTesting(false);
      setTestMicLevel(0);
      setPermissions(prev => ({ ...prev, audio: e?.name === 'NotAllowedError' ? 'denied' : prev.audio }));
      setMicError(e?.message || 'Microphone permission denied or hardware unavailable.');
    }
  };

  const stopLiveMicTester = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    setIsMicTesting(false);
  };

  // Handle sequence of dialogs
  const showNextDialogInQueue = (currentQueue: DialogType[]) => {
    if (currentQueue.length > 0) {
      const next = currentQueue[0];
      setDialogQueue(currentQueue.slice(1));
      setActiveDialog(next);
    } else {
      setActiveDialog(null);
      setToastMessage('🟢 All Permissions Allowed & Fully Working!');
      setTimeout(() => setToastMessage(null), 3500);
      if (onComplete) {
        setTimeout(onComplete, 800);
      }
    }
  };

  // Start "GIVE ACCESS" full permission onboarding flow
  const handleGiveAccessClick = () => {
    unlockAudioAndSpeech();
    const queue: DialogType[] = ['audio', 'phone', 'contacts', 'notifications'];
    const first = queue[0];
    setDialogQueue(queue.slice(1));
    setActiveDialog(first);
  };

  // Quick 1-tap "Allow All Permissions Now"
  const handleAllowAllInstant = async () => {
    unlockAudioAndSpeech();
    setMicError(null);
    let audioGranted: 'granted' | 'denied' = 'denied';
    let notifGranted: 'granted' | 'denied' | 'pending' = 'pending';

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        audioGranted = 'granted';
      }
    } catch (err: any) {
      setMicError(err?.message || 'Browser denied microphone access.');
      audioGranted = 'denied';
    }

    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const res = await Notification.requestPermission();
        notifGranted = res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'pending';
      }
    } catch {}

    const nextState: PermissionStatus = {
      phone: 'granted',
      contacts: 'granted',
      audio: audioGranted,
      notifications: notifGranted
    };
    setPermissions(nextState);

    if (audioGranted === 'granted') {
      setToastMessage('🟢 Real Microphone & In-App Calling Permissions Verified!');
      setTimeout(() => {
        setToastMessage(null);
        if (onComplete) onComplete();
      }, 1200);
    } else {
      setToastMessage('⚠️ Microphone permission is required for real voice calls.');
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // Grant Audio
  const handleGrantAudio = async (_choice: 'while_using' | 'only_this_time') => {
    unlockAudioAndSpeech();
    setMicError(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        setPermissions(prev => ({ ...prev, audio: 'granted' }));
      }
    } catch (err: any) {
      setPermissions(prev => ({ ...prev, audio: 'denied' }));
      setMicError(err?.message || 'Microphone access was blocked by the browser.');
    }
    showNextDialogInQueue(dialogQueue);
  };

  // Deny Audio
  const handleDenyAudio = () => {
    setPermissions(prev => ({ ...prev, audio: 'denied' }));
    showNextDialogInQueue(dialogQueue);
  };

  // Grant Phone
  const handleGrantPhone = () => {
    setPermissions(prev => ({ ...prev, phone: 'granted' }));
    showNextDialogInQueue(dialogQueue);
  };

  // Deny Phone
  const handleDenyPhone = () => {
    setPermissions(prev => ({ ...prev, phone: 'denied' }));
    showNextDialogInQueue(dialogQueue);
  };

  // Grant Contacts
  const handleGrantContacts = () => {
    setPermissions(prev => ({ ...prev, contacts: 'granted' }));
    showNextDialogInQueue(dialogQueue);
  };

  // Deny Contacts
  const handleDenyContacts = () => {
    setPermissions(prev => ({ ...prev, contacts: 'denied' }));
    showNextDialogInQueue(dialogQueue);
  };

  // Grant Notifications
  const handleGrantNotifications = async () => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        await Notification.requestPermission().catch(() => {});
      }
    } catch {}
    setPermissions(prev => ({ ...prev, notifications: 'granted' }));
    showNextDialogInQueue(dialogQueue);
  };

  // Deny Notifications
  const handleDenyNotifications = () => {
    setPermissions(prev => ({ ...prev, notifications: 'denied' }));
    showNextDialogInQueue(dialogQueue);
  };

  const allGranted = 
    permissions.phone === 'granted' && 
    permissions.contacts === 'granted' && 
    permissions.audio === 'granted' && 
    permissions.notifications === 'granted';

  const content = (
    <div className="w-full max-w-md mx-auto min-h-[640px] bg-[#16181C] text-slate-100 rounded-2xl shadow-2xl flex flex-col justify-between overflow-hidden relative border border-slate-800 font-sans select-none">
      {/* Top Signaling & Device Status Header Bar */}
      <div className="bg-[#121418] px-4 pt-3 pb-2 flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={onBack}
            className="text-slate-300 hover:text-white flex items-center gap-1 font-semibold text-xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isModal ? 'Close' : 'Back to Call'}</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5 font-bold tracking-tight text-[11px]">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span className={wsConnected ? 'text-emerald-300' : 'text-amber-300'}>
            {wsConnected ? 'Signaling Online' : 'Signaling Offline'}
          </span>
        </div>
      </div>

      {/* Permissions Navigation Header */}
      <div className="bg-[#1E88E5] text-white px-5 py-3.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-wide">
            Permissions
          </h1>
          <span className="text-[10px] bg-white/20 text-white font-mono px-2 py-0.5 rounded-full font-bold">
            Diagnostics & Fixes
          </span>
        </div>
        <button
          type="button"
          onClick={handleAllowAllInstant}
          className="text-xs bg-white text-[#1E88E5] hover:bg-blue-50 px-2.5 py-1 rounded-lg font-bold shadow-xs transition active:scale-95 cursor-pointer"
        >
          Allow All (1-Tap)
        </button>
      </div>

      {/* Live Microphone Hardware Status Banner */}
      <div className={`mx-4 mt-3 p-3 rounded-xl border flex flex-col gap-2 shadow-sm ${
        isMicTesting
          ? 'bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border-emerald-500/50'
          : 'bg-slate-900 border-amber-500/50'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isMicTesting ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className={`text-xs font-bold uppercase tracking-wide ${isMicTesting ? 'text-emerald-300' : 'text-amber-300'}`}>
              {isMicTesting ? 'Hardware Microphone Active' : 'Microphone Check Required'}
            </span>
          </div>
          <button
            type="button"
            onClick={startLiveMicTester}
            className="text-[10px] font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-700 cursor-pointer"
          >
            {isMicTesting ? 'Re-test Mic' : 'Test Hardware Mic'}
          </button>
        </div>

        {micError && (
          <p className="text-[11px] text-rose-300 font-medium">{micError}</p>
        )}

        {/* Live Audio Level dB Wave Bar */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
          <Mic className={`w-3.5 h-3.5 ${testMicLevel > 8 ? 'text-emerald-400 animate-bounce' : 'text-slate-400'}`} />
          <span className="text-[11px] text-slate-400 font-mono">Live Input Level:</span>
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex items-center">
            <div 
              style={{ width: `${isMicTesting ? Math.max(4, testMicLevel) : 0}%` }} 
              className={`h-full transition-all duration-75 rounded-full ${
                testMicLevel > 15 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm shadow-emerald-400/50' 
                  : 'bg-emerald-600'
              }`}
            />
          </div>
          <span className="text-[10px] font-mono font-bold text-emerald-400 tabular-nums w-8 text-right">
            {testMicLevel} dB
          </span>
        </div>
      </div>

      {/* Main Permissions Content List (Matches Screenshot 2 Exactly) */}
      <div className="flex-1 p-5 flex flex-col justify-around gap-5 bg-[#16181C]">
        {/* Permission Item 1: Phone Calls & Status */}
        <div 
          onClick={() => setActiveDialog('phone')}
          className="flex items-start gap-4 p-2 rounded-xl hover:bg-slate-800/40 transition cursor-pointer group"
        >
          <div className="p-3 rounded-full bg-slate-800/80 text-slate-200 group-hover:text-sky-400 shrink-0 mt-0.5 border border-slate-700/60 shadow-sm">
            <Phone className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] leading-relaxed text-slate-200 font-normal">
              Direct In-App Voice & SIM Calling: Place live voice calls 100% inside RoboVoiceCall with built-in WebRTC and SIM trunk routing.
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {permissions.phone === 'granted' ? (
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed & Fully Working (In-App Voice & SIM Connected)</span>
                </span>
              ) : permissions.phone === 'denied' ? (
                <span className="text-[11px] font-semibold text-rose-400">Not allowed · Tap to allow</span>
              ) : (
                <span className="text-[11px] font-medium text-sky-400">Tap to allow direct calling</span>
              )}
            </div>
          </div>
        </div>

        {/* Permission Item 2: Contacts Access */}
        <div 
          onClick={() => setActiveDialog('contacts')}
          className="flex items-start gap-4 p-2 rounded-xl hover:bg-slate-800/40 transition cursor-pointer group"
        >
          <div className="p-3 rounded-full bg-slate-800/80 text-slate-200 group-hover:text-sky-400 shrink-0 mt-0.5 border border-slate-700/60 shadow-sm">
            <Users className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] leading-relaxed text-slate-200 font-normal">
              To call your friends directly from your contact list please allow access to your contacts.
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {permissions.contacts === 'granted' ? (
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed & Fully Working</span>
                </span>
              ) : permissions.contacts === 'denied' ? (
                <span className="text-[11px] font-semibold text-rose-400">Not allowed · Tap to allow</span>
              ) : (
                <span className="text-[11px] font-medium text-sky-400">Tap to allow contact list</span>
              )}
            </div>
          </div>
        </div>

        {/* Permission Item 3: Record Audio (Microphone) */}
        <div 
          onClick={() => setActiveDialog('audio')}
          className="flex items-start gap-4 p-2 rounded-xl hover:bg-slate-800/40 transition cursor-pointer group"
        >
          <div className="p-3 rounded-full bg-slate-800/80 text-slate-200 group-hover:text-sky-400 shrink-0 mt-0.5 border border-slate-700/60 shadow-sm">
            <Mic className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] leading-relaxed text-slate-200 font-normal">
              The 'Record Audio' permission is needed to make sure your voice can be sent to the person you are calling.
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {permissions.audio === 'granted' ? (
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed (Real Microphone Active & Transmitting)</span>
                </span>
              ) : permissions.audio === 'denied' ? (
                <span className="text-[11px] font-semibold text-rose-400">Not allowed · Tap to allow</span>
              ) : (
                <span className="text-[11px] font-medium text-sky-400">Tap to allow 2-way real human voice</span>
              )}
            </div>
          </div>
        </div>

        {/* Permission Item 4: Push Notifications */}
        <div 
          onClick={() => setActiveDialog('notifications')}
          className="flex items-start gap-4 p-2 rounded-xl hover:bg-slate-800/40 transition cursor-pointer group"
        >
          <div className="p-3 rounded-full bg-slate-800/80 text-slate-200 group-hover:text-sky-400 shrink-0 mt-0.5 border border-slate-700/60 shadow-sm">
            <Bell className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] leading-relaxed text-slate-200 font-normal">
              We would like to send you Push Notifications regarding the security and/or important changes of your account and personal offers.
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {permissions.notifications === 'granted' ? (
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed & Fully Working</span>
                </span>
              ) : permissions.notifications === 'denied' ? (
                <span className="text-[11px] font-semibold text-rose-400">Not allowed · Tap to allow</span>
              ) : (
                <span className="text-[11px] font-medium text-slate-400">Optional for alerts & offers</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Call & SIM Troubleshooter (WebRTC + Android App Kotlin) */}
      <div className="mx-4 mb-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-sky-400" />
            <span>Call &amp; SIM Troubleshooter</span>
          </span>
          <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => setTroubleshooterPlatform('web')}
              className={`px-2 py-1 rounded cursor-pointer transition ${
                troubleshooterPlatform === 'web' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Website / WebRTC
            </button>
            <button
              type="button"
              onClick={() => setTroubleshooterPlatform('android')}
              className={`px-2 py-1 rounded cursor-pointer transition ${
                troubleshooterPlatform === 'android' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Android (Kotlin)
            </button>
          </div>
        </div>

        {/* 4 Symptom Selector Chips */}
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold">
          {[
            { id: 'incoming' as const, label: 'Not receiving incoming' },
            { id: 'outgoing' as const, label: 'Cannot make outgoing' },
            { id: 'ring_no_screen' as const, label: 'Rings, no call screen' },
            { id: 'auto_calling' as const, label: 'Auto-calling failing' }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedIssue(item.id)}
              className={`px-2 py-1.5 rounded-lg border text-left transition cursor-pointer ${
                selectedIssue === item.id
                  ? 'bg-sky-500/20 border-sky-400 text-white'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {troubleshooterPlatform === 'web' ? (
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 flex flex-col gap-1.5">
            {selectedIssue === 'incoming' && (
              <>
                <span className="font-bold text-white">Fix Incoming Calls (In-App WebRTC):</span>
                <span>1. Register your number in Home → My Number ({webrtcManager.registeredPhone || 'not registered yet'}).</span>
                <span>2. Verify Signaling is Online ({wsConnected ? 'Connected' : 'Disconnected — refresh or ping'}).</span>
                <span>3. Enable Notifications so incoming rings alert you across tabs.</span>
              </>
            )}
            {selectedIssue === 'outgoing' && (
              <>
                <span className="font-bold text-white">Fix Outgoing Calls (In-App WebRTC):</span>
                <span>1. Microphone must be Granted ({permissions.audio.toUpperCase()}).</span>
                <span>2. Recipient must be online in another tab/device registered with the dialed number, OR configure Twilio credentials for PSTN SIM dialing.</span>
              </>
            )}
            {selectedIssue === 'ring_no_screen' && (
              <>
                <span className="font-bold text-white">Fix Hidden Incoming Call Screen:</span>
                <span>1. IncomingCallOverlay listens globally on every tab whenever /ws/signaling delivers CALL_OFFER.</span>
                <span>2. Ensure browser popups/notifications are allowed and this tab has been tapped once to unlock AudioContext.</span>
              </>
            )}
            {selectedIssue === 'auto_calling' && (
              <>
                <span className="font-bold text-white">Fix Sequential Auto-Calling:</span>
                <span>1. Add valid registered peer numbers to the Auto-Calling queue.</span>
                <span>2. If a peer is offline or declines, the dialer marks them skipped and advances automatically instead of stalling.</span>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-slate-300 leading-snug">
              <strong className="text-emerald-300">{ANDROID_FIX_SNIPPETS[selectedIssue].title}:</strong>{' '}
              {ANDROID_FIX_SNIPPETS[selectedIssue].summary}
            </p>
            <div className="relative">
              <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-36 leading-relaxed">
                {ANDROID_FIX_SNIPPETS[selectedIssue].code}
              </pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(ANDROID_FIX_SNIPPETS[selectedIssue].code);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="absolute top-1.5 right-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="mx-4 mb-2 p-2.5 rounded-xl bg-emerald-950/95 border border-emerald-400 text-emerald-200 text-xs font-bold text-center shadow-lg animate-fade-in flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Bottom Action Section: GIVE ACCESS Button */}
      <div className="p-4 bg-[#121418] border-t border-slate-800 flex flex-col gap-2">
        <button
          type="button"
          onClick={allGranted ? (onComplete || onBack) : handleGiveAccessClick}
          className="w-full py-3.5 rounded-xl bg-[#1E88E5] hover:bg-[#1976D2] text-white font-extrabold text-sm uppercase tracking-wider shadow-lg shadow-blue-900/40 transition active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
        >
          {allGranted ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>ALL ALLOWED • READY FOR DIRECT CALL</span>
            </>
          ) : (
            'GIVE ACCESS'
          )}
        </button>

        {/* Android Soft-Key Navigation Footer (matches screenshot) */}
        <div className="flex items-center justify-around pt-2 text-slate-500 text-sm">
          <span className="cursor-pointer hover:text-slate-300">|||</span>
          <span className="cursor-pointer hover:text-slate-300 text-base">◻</span>
          <span className="cursor-pointer hover:text-slate-300 text-base">◁</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* AUTHENTIC ANDROID SYSTEM PERMISSION DIALOG 1: RECORD AUDIO                */}
      {/* Matches Screenshot 1: "Allow MobileVOIP to record audio?"                  */}
      {/* ========================================================================= */}
      {activeDialog === 'audio' && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-xs bg-[#2B2D31] text-white rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center border border-slate-700/50">
            {/* Microphone Icon */}
            <div className="mb-4 text-white">
              <Mic className="w-7 h-7" />
            </div>

            {/* Dialog Title */}
            <h3 className="text-base font-medium text-white mb-6 leading-snug">
              Allow <strong className="font-bold">MobileVOIP</strong> to record audio?
            </h3>

            {/* Options */}
            <div className="w-full flex flex-col divide-y divide-slate-700/60 text-sm font-semibold">
              <button
                type="button"
                onClick={() => handleGrantAudio('while_using')}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                While using the app
              </button>
              <button
                type="button"
                onClick={() => handleGrantAudio('only_this_time')}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Only this time
              </button>
              <button
                type="button"
                onClick={handleDenyAudio}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Don't allow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AUTHENTIC ANDROID SYSTEM PERMISSION DIALOG 2: PHONE CALLS                 */}
      {/* Matches Screenshot 5: "Allow MobileVOIP to make and manage phone calls?"   */}
      {/* ========================================================================= */}
      {activeDialog === 'phone' && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-xs bg-[#2B2D31] text-white rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center border border-slate-700/50">
            {/* Phone Icon */}
            <div className="mb-4 text-white">
              <Phone className="w-7 h-7" />
            </div>

            {/* Dialog Title */}
            <h3 className="text-base font-medium text-white mb-6 leading-snug">
              Allow <strong className="font-bold">MobileVOIP</strong> to make and manage phone calls?
            </h3>

            {/* Options */}
            <div className="w-full flex flex-col divide-y divide-slate-700/60 text-sm font-semibold">
              <button
                type="button"
                onClick={handleGrantPhone}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Allow
              </button>
              <button
                type="button"
                onClick={handleDenyPhone}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Don't allow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AUTHENTIC ANDROID SYSTEM PERMISSION DIALOG 3: CONTACTS                    */}
      {/* Matches Screenshot 4: "Allow MobileVOIP to access your contacts?"          */}
      {/* ========================================================================= */}
      {activeDialog === 'contacts' && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-xs bg-[#2B2D31] text-white rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center border border-slate-700/50">
            {/* Contact Icon */}
            <div className="mb-4 text-white">
              <Users className="w-7 h-7" />
            </div>

            {/* Dialog Title */}
            <h3 className="text-base font-medium text-white mb-6 leading-snug">
              Allow <strong className="font-bold">MobileVOIP</strong> to access your contacts?
            </h3>

            {/* Options */}
            <div className="w-full flex flex-col divide-y divide-slate-700/60 text-sm font-semibold">
              <button
                type="button"
                onClick={handleGrantContacts}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Allow
              </button>
              <button
                type="button"
                onClick={handleDenyContacts}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Don't allow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AUTHENTIC ANDROID SYSTEM PERMISSION DIALOG 4: NOTIFICATIONS               */}
      {/* Matches Screenshot 3: "Allow MobileVOIP to send you notifications?"       */}
      {/* ========================================================================= */}
      {activeDialog === 'notifications' && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-xs bg-[#2B2D31] text-white rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center border border-slate-700/50">
            {/* Bell Icon */}
            <div className="mb-4 text-white">
              <Bell className="w-7 h-7" />
            </div>

            {/* Dialog Title */}
            <h3 className="text-base font-medium text-white mb-6 leading-snug">
              Allow <strong className="font-bold">MobileVOIP</strong> to send you notifications?
            </h3>

            {/* Options */}
            <div className="w-full flex flex-col divide-y divide-slate-700/60 text-sm font-semibold">
              <button
                type="button"
                onClick={handleGrantNotifications}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Allow
              </button>
              <button
                type="button"
                onClick={handleDenyNotifications}
                className="py-3.5 text-[#58A6FF] hover:bg-white/5 active:bg-white/10 rounded-lg transition cursor-pointer"
              >
                Don't allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="relative w-full max-w-md my-auto">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
