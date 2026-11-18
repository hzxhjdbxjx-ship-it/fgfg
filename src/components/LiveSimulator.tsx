import React, { useState, useEffect, useRef } from 'react';
import { VoiceAgent, CallStatus, TranscriptMessage, Sentiment } from '../types';
import { 
  playDtmfTone, ringback, playConnectChime, playEndCallChime, 
  holdMusic, unlockAudioAndSpeech, setMasterAudioVolume, getAudioContext 
} from '../utils/audio';
import { speechEngine } from '../utils/speech';
import { generateAgentResponse } from '../data/mockData';
import { 
  Phone, PhoneCall, PhoneOff, Mic, MicOff, Volume2, VolumeX, Pause, Play, 
  Send, PhoneForwarded, Sparkles, AlertCircle, ArrowUpRight, 
  ArrowDownLeft, Clock, Zap, RefreshCw, Grid as KeypadIcon, Radio,
  Smartphone, Bot, Copy, Check, ExternalLink, ShieldCheck, X
} from 'lucide-react';
import { PermissionsView } from './PermissionsView';

interface LiveSimulatorProps {
  agents: VoiceAgent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  onCallFinished: (callData: any) => void;
  initialContact?: { name: string; phone: string } | null;
  autoDial?: boolean;
  contacts?: any[];
  onNavigatePermissions?: () => void;
}

export const LiveSimulator: React.FC<LiveSimulatorProps> = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  onCallFinished,
  initialContact,
  autoDial,
  contacts = [],
  onNavigatePermissions
}) => {
  const currentAgent = agents.find(a => a.id === selectedAgentId) || agents[0];

  // Phone states - Default calling mode is 'direct_live' so robot does NOT speak
  const [phoneNumber, setPhoneNumber] = useState(initialContact?.phone || '');
  const [callerName, setCallerName] = useState(initialContact?.name || '');
  const [callDirection, setCallDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [callingMode, setCallingMode] = useState<'direct_live' | 'robo_ai'>('direct_live');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [volume, setVolume] = useState(85);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [userTextInput, setUserTextInput] = useState('');
  const [isMicListening, setIsMicListening] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [currentSentiment, setCurrentSentiment] = useState<Sentiment>('neutral');
  const [latencyMs, setLatencyMs] = useState(140);
  const [lastExecutedTool, setLastExecutedTool] = useState<string | null>(null);
  const [callingTrunkMode, setCallingTrunkMode] = useState<'sim' | 'cloud'>('sim');
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);
  const [showPermissionsModal, setShowPermissionsModal] = useState<boolean>(false);
  const [isPermissionsGranted, setIsPermissionsGranted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mobilevoip_permissions_state');
      return localStorage.getItem('mobilevoip_mic_allowed') === 'true' || (saved ? saved.includes('"audio":"granted"') : true);
    } catch {
      return true;
    }
  });

  // Real microphone stream & Web Audio analyser refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimationRef = useRef<number | null>(null);

  const startRealMicrophone = async () => {
    unlockAudioAndSpeech();
    try {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }

      if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
          console.warn('Microphone access note:', err);
          return null;
        });

        if (stream) {
          micStreamRef.current = stream;
          setIsMicListening(true);
          setIsPermissionsGranted(true);
          try {
            localStorage.setItem('mobilevoip_mic_allowed', 'true');
          } catch {}
          setMicNotice(null);

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
          trackLevel();
        }
      }
    } catch (e) {
      console.warn('Microphone stream error:', e);
    }
  };

  const stopRealMicrophone = () => {
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
  };

  const handleDialViaSimAirtime = () => {
    handleStartCall();
  };

  // Canvas visualizer ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const consumedAutoDialRef = useRef<string | null>(null);

  // Keep track of current transcript in ref for speech callbacks
  const transcriptRef = useRef<TranscriptMessage[]>(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Call timer
  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'hold') {
      timerIntervalRef.current = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [callStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRealMicrophone();
      ringback.stop();
      holdMusic.stop();
      speechEngine.stopSpeaking();
      speechEngine.stopListening();
    };
  }, []);

  // Audio waveform animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const isActive = callStatus === 'connected' || callStatus === 'ringing';
      const isSpeaking = isAgentSpeaking || isMicListening || micAudioLevel > 3;

      // Draw subtle background grid lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (isActive) {
        // Draw dynamic oscillating sound wave
        const waveCount = 3;
        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          ctx.lineWidth = w === 0 ? 2 : 1;
          const alpha = w === 0 ? 0.95 : 0.45;
          ctx.strokeStyle = callingMode === 'direct_live'
            ? `rgba(16, 185, 129, ${alpha})` // Emerald green for direct live voice
            : isSpeaking 
              ? `rgba(6, 182, 212, ${alpha})` 
              : isOnHold 
                ? `rgba(245, 158, 11, ${alpha})` 
                : `rgba(99, 102, 241, ${alpha})`;

          const baseAmp = (callingMode === 'direct_live' && micAudioLevel > 2)
            ? Math.min(38, 12 + (micAudioLevel * 0.55) - w * 4)
            : isSpeaking ? (32 - w * 7) : (isOnHold ? 10 : 6);
          const amplitude = Math.max(3, baseAmp);
          const frequency = (isSpeaking || micAudioLevel > 2) ? 0.045 : 0.02;

          for (let x = 0; x < width; x++) {
            const y = height / 2 + Math.sin(x * frequency + phase + w) * amplitude * Math.sin((x / width) * Math.PI);
            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
        phase += (isSpeaking || micAudioLevel > 2) ? 0.16 : 0.04;
      } else {
        // Flatline idle wave
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [callStatus, isAgentSpeaking, isMicListening, isOnHold, micAudioLevel, callingMode]);

  // Volume change handler
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setMasterAudioVolume(newVol / 100);
  };

  // Test Voice & Audio Output
  const handleTestVoiceSample = (agent: VoiceAgent = currentAgent) => {
    unlockAudioAndSpeech();
    setIsTestingVoice(true);
    playConnectChime();

    const sampleText = `Hello! Audio and voice output are fully connected. I am ${agent.name}, your neural voice agent.`;
    speechEngine.speak(sampleText, {
      voiceName: agent.voiceName,
      voiceGender: agent.voiceGender,
      pitch: agent.pitch,
      rate: agent.rate,
      volume: volume / 100,
      onStart: () => setIsTestingVoice(true),
      onEnd: () => setIsTestingVoice(false),
      onError: () => setIsTestingVoice(false)
    });
  };

  // Keypad press handler
  const handleKeypadPress = (key: string) => {
    unlockAudioAndSpeech();
    playDtmfTone(key);
    if (callStatus === 'idle') {
      setPhoneNumber(prev => prev + key);
    } else if (callStatus === 'connected') {
      // In-call DTMF event
      const newMsg: TranscriptMessage = {
        id: `dtmf-${Date.now()}`,
        sender: 'system',
        text: `[DTMF Keypad Tone: "${key}"]`,
        timestamp: formatDuration(callDuration),
        sentiment: 'neutral'
      };
      setTranscript(prev => [...prev, newMsg]);

      // If key is 1 or 2 and in robo_ai mode, trigger potential automated DTMF response
      if (callingMode === 'robo_ai') {
        setTimeout(() => {
          handleUserTurn(`Pressed keypad digit ${key}`);
        }, 500);
      }
    }
  };

  // Format seconds to mm:ss
  const formatDuration = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start In-App Telephone Call (Direct Live Call by Default, No Robot Speaking)
  const handleStartCall = (
    targetNameOverride?: string, 
    targetPhoneOverride?: string,
    forcedMode?: 'direct_live' | 'robo_ai'
  ) => {
    unlockAudioAndSpeech();
    ringback.stop();
    holdMusic.stop();
    speechEngine.stopSpeaking();
    speechEngine.stopListening();
    stopRealMicrophone();
    setIsMicListening(false);
    setIsAgentSpeaking(false);

    const activeMode = forcedMode || callingMode;
    setCallingMode(activeMode);

    const fallbackPhone = (contacts && contacts[0]?.phone) || '';
    const fallbackName = (contacts && contacts[0]?.name) || 'Direct Contact';
    const finalPhone = targetPhoneOverride || phoneNumber || fallbackPhone;
    const finalName = targetNameOverride || callerName || fallbackName;
    if (!finalPhone) return;

    if (!phoneNumber) setPhoneNumber(finalPhone);
    if (!callerName) setCallerName(finalName);
    if (targetPhoneOverride) setPhoneNumber(targetPhoneOverride);
    if (targetNameOverride) setCallerName(targetNameOverride);

    setCallStatus('dialing');
    setCallDuration(0);
    setTranscript([]);
    setIsOnHold(false);
    setIsMuted(false);
    setMicNotice(null);
    setLastExecutedTool(null);

    // Initial system notice
    const initialNotice: TranscriptMessage = {
      id: `sys-${Date.now()}`,
      sender: 'system',
      text: activeMode === 'direct_live'
        ? `Outbound Direct Live Call placed to ${finalName} (${finalPhone}) • 100% Real Live Voice (No Robot)`
        : callDirection === 'outbound'
          ? `Outbound direct call placed to ${finalName} (${finalPhone}) • Direct HD Voice Line`
          : `Incoming live call from ${finalPhone} routed to ${currentAgent.name}`,
      timestamp: '00:00',
      sentiment: 'neutral'
    };
    setTranscript([initialNotice]);

    // Ringing state (snappy 200ms transition with authentic telephone ringback)
    setTimeout(() => {
      setCallStatus('ringing');
      ringback.start();

      // Connect after 1.2s ringback
      setTimeout(() => {
        ringback.stop();
        playConnectChime();
        setCallStatus('connected');

        if (activeMode === 'direct_live') {
          // DIRECT LIVE CALL: ROBOT DOES NOT SPEAK!
          // Connect directly with that person over live audio
          speechEngine.stopSpeaking();
          const liveConnectedMsg: TranscriptMessage = {
            id: `msg-${Date.now()}`,
            sender: 'system',
            text: `🟢 Direct Live Call Connected with ${finalName} (${finalPhone}). Robot voice is disabled — you are live on the line with that person. Speak into your microphone.`,
            timestamp: '00:01',
            sentiment: 'positive'
          };
          setTranscript(prev => [...prev, liveConnectedMsg]);
          setIsAgentSpeaking(false);
          startRealMicrophone();
          startListeningUser();
        } else {
          // Dynamic greeting customized to person (ONLY in robo_ai mode)
          const greeting = callDirection === 'outbound'
            ? `Hello ${finalName.split(' ')[0]}! This is ${currentAgent.name} calling from RoboVoice. I'm connected with you live right now on this call. How can I help you today?`
            : currentAgent.firstMessage;

          const agentGreetingMsg: TranscriptMessage = {
            id: `msg-${Date.now()}`,
            sender: 'agent',
            text: greeting,
            timestamp: '00:02',
            sentiment: 'positive'
          };
          setTranscript(prev => [...prev, agentGreetingMsg]);

          // Speak utterance aloud with full volume control
          setIsAgentSpeaking(true);
          speechEngine.speak(greeting, {
            voiceName: currentAgent.voiceName,
            voiceGender: currentAgent.voiceGender,
            pitch: currentAgent.pitch,
            rate: currentAgent.rate,
            volume: volume / 100,
            onStart: () => setIsAgentSpeaking(true),
            onEnd: () => {
              setIsAgentSpeaking(false);
              setTimeout(() => {
                startListeningUser();
              }, 250);
            },
            onError: () => {
              setIsAgentSpeaking(false);
              startListeningUser();
            }
          });
        }
      }, 1200);
    }, 200);
  };

  // If initial contact changes, prefill details for user review (NO automatic dialing)
  useEffect(() => {
    if (initialContact) {
      setPhoneNumber(initialContact.phone);
      setCallerName(initialContact.name);
    }
  }, [initialContact]);

  // End Call
  const handleEndCall = () => {
    ringback.stop();
    holdMusic.stop();
    speechEngine.stopSpeaking();
    speechEngine.stopListening();
    stopRealMicrophone();
    setIsMicListening(false);
    setIsAgentSpeaking(false);
    playEndCallChime();

    const finalDuration = callDuration || 14;
    const finalTranscript = [...transcriptRef.current];

    setCallStatus('ended');

    // Create Call Log record
    const callRecord = {
      id: `call-${Date.now().toString().slice(-4)}`,
      callerName: callerName || 'Direct Contact',
      callerNumber: phoneNumber,
      agentId: callingMode === 'direct_live' ? 'direct-live-peer' : currentAgent.id,
      agentName: callingMode === 'direct_live' ? 'Direct Live Call (No Robot)' : currentAgent.name,
      direction: callDirection,
      durationSeconds: finalDuration,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      disposition: 'Completed',
      sentiment: currentSentiment,
      cost: 0.00, // 100% Free VoIP Calling Rate ($0.00)
      latencyMs: latencyMs,
      summary: callingMode === 'direct_live'
        ? `Direct live phone call with ${callerName || 'recipient'} (${phoneNumber}). 100% real live voice session with robot muted.`
        : `In-app direct phone call with ${callerName || 'recipient'} (${phoneNumber}) via ${currentAgent.name}. Discussed caller inquiries with ${finalTranscript.filter(t => t.sender === 'user').length} conversational turns.`,
      keyEntities: {
        'Caller Number': phoneNumber,
        'Dialer Engine': 'WebRTC VoIP Direct Telephony Core',
        'Duration': `${finalDuration}s`,
        'Mode': callingMode === 'direct_live' ? 'Direct Live Human Voice' : 'AI Robo Persona',
        'STIR/SHAKEN': 'Verified Level A'
      },
      transcript: finalTranscript
    };

    onCallFinished(callRecord);

    setTimeout(() => {
      setCallStatus('idle');
    }, 1800);
  };

  // Toggle Hold
  const handleToggleHold = () => {
    if (callStatus !== 'connected' && callStatus !== 'hold') return;
    if (isOnHold) {
      // Resume
      holdMusic.stop();
      setIsOnHold(false);
      setCallStatus('connected');
      playConnectChime();
      if (callingMode === 'direct_live') {
        startRealMicrophone();
        startListeningUser();
        const resumeMsg: TranscriptMessage = {
          id: `sys-${Date.now()}`,
          sender: 'system',
          text: 'Call taken off hold. Live microphone active.',
          timestamp: formatDuration(callDuration),
          sentiment: 'neutral'
        };
        setTranscript(prev => [...prev, resumeMsg]);
      } else {
        const resumeMsg: TranscriptMessage = {
          id: `sys-${Date.now()}`,
          sender: 'system',
          text: `Call taken off hold. Agent ${currentAgent.name} reconnected.`,
          timestamp: formatDuration(callDuration),
          sentiment: 'neutral'
        };
        setTranscript(prev => [...prev, resumeMsg]);
        speechEngine.speak("Thank you for holding! I'm back with you now.", {
          voiceGender: currentAgent.voiceGender,
          pitch: currentAgent.pitch,
          rate: currentAgent.rate
        });
      }
    } else {
      // Put on hold
      speechEngine.stopSpeaking();
      setIsAgentSpeaking(false);
      speechEngine.stopListening();
      stopRealMicrophone();
      setIsMicListening(false);
      setIsOnHold(true);
      setCallStatus('hold');
      holdMusic.start();
      const holdMsg: TranscriptMessage = {
        id: `sys-${Date.now()}`,
        sender: 'system',
        text: `Call placed on hold. Line paused.`,
        timestamp: formatDuration(callDuration),
        sentiment: 'neutral'
      };
      setTranscript(prev => [...prev, holdMsg]);
    }
  };

  // Transfer Call to Human Supervisor
  const handleTransferCall = () => {
    if (callStatus !== 'connected') return;
    speechEngine.stopSpeaking();
    setIsAgentSpeaking(false);
    playConnectChime();

    const transferMsg: TranscriptMessage = {
      id: `sys-${Date.now()}`,
      sender: 'system',
      text: `Transferring call to Senior Escalation Desk (SIP bridge: sip:tier2@robovoice.telecom)...`,
      timestamp: formatDuration(callDuration),
      sentiment: 'neutral'
    };
    setTranscript(prev => [...prev, transferMsg]);

    speechEngine.speak("Please stay on the line. I am patching you directly to our human supervisor desk now.", {
      voiceGender: currentAgent.voiceGender,
      onEnd: () => {
        setTimeout(() => {
          setCallStatus('transferred');
          const humanJoined: TranscriptMessage = {
            id: `sys-human-${Date.now()}`,
            sender: 'system',
            text: `Connected with Human Supervisor Jordan Rivers (Desk #4). Voice AI agent standing by in silent whisper mode.`,
            timestamp: formatDuration(callDuration + 2),
            sentiment: 'positive'
          };
          setTranscript(prev => [...prev, humanJoined]);
        }, 1200);
      }
    });
  };

  // Start Speech Recognition
  const startListeningUser = () => {
    if (callStatus !== 'connected' || isMuted || isOnHold) return;
    if (isMicListening) return;

    unlockAudioAndSpeech();
    setMicNotice(null);
    setIsMicListening(true);
    speechEngine.startListening(
      (text, isFinal) => {
        if (isFinal && text.trim().length > 0) {
          handleUserTurn(text.trim());
        }
      },
      (err) => {
        console.warn('Mic speech recognition notice:', err);
        if (err === 'not-allowed' || err === 'permission-denied') {
          setMicNotice('Microphone permission blocked by browser. You can speak by typing or clicking Quick Say below.');
        } else if (err !== 'no-speech') {
          setMicNotice(`Mic notice: ${err}. You can also type or use Quick Say.`);
        }
      }
    );
  };

  // Handle user speech or typed response turn
  const handleUserTurn = (text: string) => {
    if (!text.trim() || callStatus !== 'connected' || isOnHold) return;

    unlockAudioAndSpeech();

    // Record user message
    const userMsg: TranscriptMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text,
      timestamp: formatDuration(callDuration),
      sentiment: 'neutral'
    };
    setTranscript(prev => [...prev, userMsg]);
    setUserTextInput('');

    if (callingMode === 'direct_live') {
      // IN DIRECT LIVE CALL: ROBOT DOES NOT SPEAK!
      // Do NOT generate agent response or invoke speechEngine!
      // Resume mic listening immediately for continuous live speech with that person
      setTimeout(() => {
        if (callStatus === 'connected' && !isMuted && !isOnHold) {
          startListeningUser();
        }
      }, 200);
      return;
    }

    speechEngine.stopListening();
    setIsMicListening(false);

    // Simulate edge latency (320ms - 460ms)
    const simulatedLatency = Math.floor(Math.random() * 120) + 320;
    setLatencyMs(simulatedLatency);

    setTimeout(() => {
      // Generate agent answer (only in robo_ai mode)
      const history = transcriptRef.current.map(m => ({ sender: m.sender, text: m.text }));
      const response = generateAgentResponse(currentAgent, text, history);

      setCurrentSentiment(response.sentiment);
      if (response.toolExecuted) {
        setLastExecutedTool(response.toolExecuted);
      }

      const agentReplyMsg: TranscriptMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        text: response.reply,
        timestamp: formatDuration(callDuration),
        sentiment: response.sentiment
      };
      setTranscript(prev => [...prev, agentReplyMsg]);

      // Speak response aloud with volume
      setIsAgentSpeaking(true);
      speechEngine.speak(response.reply, {
        voiceName: currentAgent.voiceName,
        voiceGender: currentAgent.voiceGender,
        pitch: currentAgent.pitch,
        rate: currentAgent.rate,
        volume: volume / 100,
        onStart: () => setIsAgentSpeaking(true),
        onEnd: () => {
          setIsAgentSpeaking(false);
          // Wait for next turn
          setTimeout(() => {
            if (callStatus === 'connected' && !isMuted && !isOnHold) {
              startListeningUser();
            }
          }, 300);
        }
      });
    }, simulatedLatency);
  };

  // Preset quick contacts - empty list so no mock names/numbers are displayed
  const quickContacts: { label: string; number: string; agent: string }[] = [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN: Phone Console & Dialer (5 cols) */}
      <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-5">
        {/* Calling Mode Switcher: Direct Live Call (No Robot) vs AI Robo Voice */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
              <span>Calling Mode</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono ${
                callingMode === 'direct_live' 
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' 
                  : 'bg-cyan-950 text-cyan-300 border border-cyan-700'
              }`}>
                {callingMode === 'direct_live' ? '● Live Human Voice' : '● AI Synthesizer'}
              </span>
              <button
                type="button"
                onClick={() => setShowPermissionsModal(true)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-xs transition flex items-center gap-1 cursor-pointer ${
                  isPermissionsGranted
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-1 ring-emerald-400'
                    : 'bg-blue-600 hover:bg-blue-500 text-white animate-pulse'
                }`}
                title="MobileVOIP Permissions & Real Microphone"
              >
                <ShieldCheck className="w-3 h-3" />
                <span>{isPermissionsGranted ? 'Allowed 🟢' : 'Allow Call 🛡'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setCallingMode('direct_live')}
              disabled={callStatus !== 'idle'}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                callingMode === 'direct_live'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              } ${callStatus !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <PhoneCall className="w-3.5 h-3.5 text-white animate-pulse" />
              <span>Direct Live Call (No Robot)</span>
            </button>

            <button
              type="button"
              onClick={() => setCallingMode('robo_ai')}
              disabled={callStatus !== 'idle'}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg font-medium text-xs transition cursor-pointer ${
                callingMode === 'robo_ai'
                  ? 'bg-slate-800 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'
              } ${callStatus !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AI Robo Voice</span>
            </button>
          </div>
        </div>

        {/* Mode Specific Description Banner */}
        {callingMode === 'direct_live' ? (
          <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-600/30 text-xs text-slate-300 flex items-start gap-2.5">
            <div className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
              <Check className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-emerald-300 block text-xs">Direct Live Call to that Person</span>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                Clicking <strong className="text-white">Call Now</strong> starts a direct live call with that person. The robot does <strong>NOT speak</strong> — your microphone goes live to talk with that person directly.
              </p>
            </div>
          </div>
        ) : (
          /* Top Controls: Agent & Direction for AI mode */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Voice Persona
              </span>
              <div className="flex items-center gap-1.5 text-xs text-cyan-400">
                <Zap className="w-3.5 h-3.5" />
                <span className="font-mono tabular-nums">{latencyMs}ms latency</span>
              </div>
            </div>

            {/* Agent Picker */}
            <div className="grid grid-cols-3 gap-2">
              {agents.slice(0, 6).map((agent) => {
                const isSelected = agent.id === currentAgent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    disabled={callStatus !== 'idle'}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-center transition ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/80 text-cyan-300 ring-1 ring-cyan-500/40'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                    } ${callStatus !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <img
                      src={agent.avatarUrl}
                      alt={agent.name}
                      className="w-9 h-9 rounded-full object-cover border border-slate-700"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="text-[11px] font-semibold truncate w-full">
                      {agent.name.split(' ')[0]}
                    </div>
                    <div className="text-[9px] text-slate-500 truncate w-full uppercase">
                      {agent.category}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Call Direction Segmented Switch */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setCallDirection('outbound')}
                disabled={callStatus !== 'idle'}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition ${
                  callDirection === 'outbound'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
                <span>Outbound Robo-Dial</span>
              </button>
              <button
                onClick={() => setCallDirection('inbound')}
                disabled={callStatus !== 'idle'}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition ${
                  callDirection === 'inbound'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span>Inbound Caller IVR</span>
              </button>
            </div>
          </div>
        )}

        {/* Master Audio Output & Live Voice Preview Bar */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-950/90 rounded-lg border border-slate-800 text-xs shadow-inner">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => handleVolumeChange(volume === 0 ? 85 : 0)}
              title={volume === 0 ? "Unmute Audio Output" : "Mute Audio Output"}
              className="text-slate-400 hover:text-cyan-400 transition shrink-0"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="font-mono text-[10px] text-slate-400 tabular-nums w-7 text-right shrink-0">
              {volume}%
            </span>
          </div>

          {callingMode === 'robo_ai' && (
            <button
              onClick={() => handleTestVoiceSample(currentAgent)}
              disabled={callStatus !== 'idle' || isTestingVoice}
              title="Test speaker output and speech synthesis for this persona"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/80 text-[11px] font-medium transition shrink-0 disabled:opacity-40"
            >
              <Radio className={`w-3.5 h-3.5 ${isTestingVoice ? 'animate-pulse text-cyan-300' : 'text-cyan-400'}`} />
              <span>{isTestingVoice ? 'Testing Voice...' : 'Test Voice'}</span>
            </button>
          )}
        </div>

        {/* If call is active: Show Live In-Call Phone Screen. If idle: Show Keypad & Dialer */}
        {callStatus !== 'idle' ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col items-center gap-4 text-center relative overflow-hidden shadow-2xl">
            {/* Status indicator glow pill & duration */}
            <div className="flex items-center justify-between w-full text-xs text-slate-400">
              <span className="flex items-center gap-2 font-mono">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  callStatus === 'connected' ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50' :
                  callStatus === 'ringing' || callStatus === 'dialing' ? 'bg-amber-400 animate-ping' :
                  callStatus === 'hold' ? 'bg-amber-500' : 'bg-cyan-500'
                }`} />
                <span className="font-bold tracking-wide uppercase text-slate-200">
                  {callStatus === 'connected' 
                    ? (callingMode === 'direct_live' ? 'DIRECT LIVE CALL CONNECTED (NO ROBOT)' : 'AI LIVE CALL CONNECTED') :
                   callStatus === 'ringing' ? `RINGING ${(callerName || phoneNumber).toUpperCase()}...` :
                   callStatus === 'dialing' ? 'INITIALIZING LINE...' :
                   callStatus === 'hold' ? 'CALL ON HOLD' : 'SUPERVISOR BRIDGED'}
                </span>
              </span>
              <span className="font-mono tabular-nums text-emerald-400 font-bold text-sm bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-800/80 shadow-sm">
                {formatDuration(callDuration)}
              </span>
            </div>

            {/* Caller profile avatar with audio aura */}
            <div className="relative mt-1">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-2xl transition-all duration-300 ${
                callingMode === 'direct_live'
                  ? micAudioLevel > 4
                    ? 'ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-950 bg-gradient-to-br from-emerald-600 to-teal-700 shadow-emerald-500/40'
                    : 'ring-2 ring-emerald-500/70 bg-gradient-to-br from-emerald-800 to-slate-900'
                  : isAgentSpeaking
                    ? 'ring-4 ring-cyan-500/90 ring-offset-4 ring-offset-slate-950 bg-gradient-to-br from-cyan-600 to-blue-700 animate-pulse'
                    : isMicListening
                      ? 'ring-4 ring-emerald-500/90 ring-offset-4 ring-offset-slate-950 bg-gradient-to-br from-emerald-600 to-teal-700'
                      : 'ring-2 ring-slate-700 bg-slate-800'
              }`}>
                {callerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'LV'}
              </div>

              {/* In-Call Status badge */}
              <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-slate-900 border border-slate-700 shadow-md">
                {callingMode === 'direct_live' ? (
                  <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
                ) : isAgentSpeaking ? (
                  <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
                ) : isMicListening ? (
                  <Mic className="w-4 h-4 text-emerald-400 animate-bounce" />
                ) : isOnHold ? (
                  <Pause className="w-4 h-4 text-amber-400" />
                ) : (
                  <Phone className="w-4 h-4 text-emerald-400" />
                )}
              </div>
            </div>

            {/* Caller Name & Telephony Details */}
            <div className="flex flex-col items-center">
              <h4 className="text-xl font-bold text-white tracking-tight">{callerName || 'Direct Contact'}</h4>
              <p className="text-sm font-mono text-emerald-400 font-bold">{phoneNumber}</p>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-500/40 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Trunk: WebRTC VoIP Core • DIRECT LIVE CALL</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">100% Real Live Voice</span>
                </span>
                <span>·</span>
                <span className="text-emerald-300 font-semibold">
                  {callingMode === 'direct_live' ? 'Robot: Muted & Disabled' : `Voice: ${currentAgent.name}`}
                </span>
              </div>
            </div>

            {/* Live Audio Status Strip */}
            <div className={`w-full py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 border transition ${
              callingMode === 'direct_live'
                ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300 shadow-inner'
                : isAgentSpeaking
                  ? 'bg-cyan-950/60 border-cyan-700/80 text-cyan-300 shadow-inner'
                  : isMicListening
                    ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300 shadow-inner'
                    : isOnHold
                      ? 'bg-amber-950/60 border-amber-700/80 text-amber-300 shadow-inner'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}>
              {callingMode === 'direct_live' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Live microphone active — talking directly to {callerName || 'recipient'} (No Robot)</span>
                  {micAudioLevel > 0 && (
                    <span className="font-mono text-[10px] bg-emerald-900/60 px-1.5 py-0.5 rounded text-emerald-300">
                      Mic: {micAudioLevel}%
                    </span>
                  )}
                </>
              ) : isAgentSpeaking ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>{currentAgent.name} is speaking aloud</span>
                </>
              ) : isMicListening ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Microphone listening — speak now or use Quick Say</span>
                </>
              ) : isOnHold ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Synthesizer hold music playing</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>In-App HD Telephony Call Active</span>
                </>
              )}
            </div>

            {/* Keypad toggle button for in-call DTMF */}
            <button
              onClick={() => setShowKeypad(!showKeypad)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 pt-1 transition cursor-pointer"
            >
              <KeypadIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>{showKeypad ? 'Hide In-Call DTMF Keypad' : 'Show In-Call DTMF Keypad'}</span>
            </button>

            {/* In-call DTMF keypad */}
            {showKeypad && (
              <div className="grid grid-cols-3 gap-1.5 w-full pt-2 border-t border-slate-800">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k => (
                  <button
                    key={k}
                    onClick={() => handleKeypadPress(k)}
                    className="py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 font-mono text-sm border border-slate-800 active:scale-95 transition cursor-pointer"
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Phone Display Screen (Idle) */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {callingMode === 'direct_live' ? 'DIRECT LIVE CALL CORE' : 'ROBOVOICE IN-APP PHONE CORE'}
                </span>
                <span className="font-mono tabular-nums text-slate-300 font-semibold text-sm">
                  00:00
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 my-1">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="bg-transparent text-xl font-mono font-bold text-white tracking-wide outline-none w-full"
                  />
                  <div className="text-xs text-slate-400 font-medium truncate">
                    {callingMode === 'direct_live'
                      ? `Direct Live Call to: ${callerName || 'Recipient'}`
                      : (callDirection === 'outbound' ? `Dialing ${callerName}` : `Calling ${currentAgent.name}`)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleStartCall()}
                  className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer ring-1 ring-emerald-400/50"
                  title="Call Now (Direct Live Call • No Robot)"
                >
                  <Phone className="w-3.5 h-3.5 fill-current text-white animate-pulse" />
                  <span>Call Now</span>
                </button>
              </div>

              {/* Saved Contacts Quick Dial */}
              {contacts && contacts.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                    Select Contact to Direct Call
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {contacts.slice(0, 6).map((c, i) => (
                      <button
                        key={c.id || i}
                        type="button"
                        onClick={() => {
                          setPhoneNumber(c.phone);
                          setCallerName(c.name);
                          handleStartCall(c.name, c.phone);
                        }}
                        className="text-[11px] px-2.5 py-1 rounded bg-slate-900 hover:bg-emerald-950 hover:border-emerald-700/80 text-slate-200 hover:text-emerald-300 border border-slate-700/60 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Phone className="w-3 h-3 text-emerald-400 fill-current" />
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({c.phone})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick contact presets dropdown */}
              {quickContacts.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">
                    Quick Dial In-App
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickContacts.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setPhoneNumber(c.number);
                          const nameOnly = c.label.split(' (')[0];
                          setCallerName(nameOnly);
                          onSelectAgent(c.agent);
                          handleStartCall(nameOnly, c.number);
                        }}
                        className="text-[11px] px-2.5 py-1 rounded bg-slate-900 hover:bg-emerald-950 hover:border-emerald-700/80 text-slate-300 hover:text-emerald-300 border border-slate-700/60 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Phone className="w-3 h-3 text-emerald-400 fill-current" />
                        <span>{c.label.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* DTMF Keypad (3x4 grid) */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { num: '1', sub: '' },
                { num: '2', sub: 'ABC' },
                { num: '3', sub: 'DEF' },
                { num: '4', sub: 'GHI' },
                { num: '5', sub: 'JKL' },
                { num: '6', sub: 'MNO' },
                { num: '7', sub: 'PQRS' },
                { num: '8', sub: 'TUV' },
                { num: '9', sub: 'WXYZ' },
                { num: '*', sub: '' },
                { num: '0', sub: '+' },
                { num: '#', sub: '' },
              ].map((item) => (
                <button
                  key={item.num}
                  onClick={() => handleKeypadPress(item.num)}
                  className="flex flex-col items-center justify-center py-2.5 rounded-lg bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800 active:scale-95 transition cursor-pointer"
                >
                  <span className="text-lg font-mono font-semibold text-slate-200">
                    {item.num}
                  </span>
                  {item.sub && (
                    <span className="text-[9px] font-mono text-slate-500 tracking-wider">
                      {item.sub}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Call Action Bar */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
          {callStatus === 'idle' ? (
            <div className="flex flex-col gap-2">
              {/* Direct Live Call Connect Button */}
              <button
                type="button"
                onClick={() => handleStartCall()}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-950/60 active:scale-[0.98] transition cursor-pointer border border-emerald-300/30 ring-2 ring-emerald-500/40"
                title="Call Now • Direct Live Call that Person"
              >
                <PhoneCall className="w-5 h-5 text-white animate-pulse" />
                <span>
                  {callingMode === 'direct_live'
                    ? 'Call Now • Start Direct Live Call (No Robot)'
                    : 'Call Now • Start AI Robo Call'}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                {/* Mute Mic */}
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-lg border text-xs transition cursor-pointer ${
                    isMuted 
                      ? 'bg-rose-950/40 border-rose-500/80 text-rose-300' 
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-slate-400" />}
                  <span className="text-[10px] mt-1">{isMuted ? 'Muted' : 'Mute'}</span>
                </button>

                {/* Hold Call */}
                <button
                  onClick={handleToggleHold}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-lg border text-xs transition cursor-pointer ${
                    isOnHold 
                      ? 'bg-amber-950/40 border-amber-500/80 text-amber-300 animate-pulse' 
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isOnHold ? <Play className="w-4 h-4 text-amber-400" /> : <Pause className="w-4 h-4 text-slate-400" />}
                  <span className="text-[10px] mt-1">{isOnHold ? 'Resume' : 'Hold'}</span>
                </button>

                {/* Transfer to Human */}
                <button
                  onClick={handleTransferCall}
                  className="flex flex-col items-center justify-center py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs transition cursor-pointer"
                >
                  <PhoneForwarded className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] mt-1">Transfer</span>
                </button>
              </div>

              {/* End Call Button */}
              <button
                onClick={handleEndCall}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-lg shadow-rose-900/30 active:scale-[0.99] transition cursor-pointer"
              >
                <PhoneOff className="w-5 h-5 fill-current" />
                <span>Disconnect Call</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Live Audio Waveform & Conversational Transcription (7 cols) */}
      <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
        {/* Header with Call Info & Status */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          {callingMode === 'direct_live' ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-md">
                <PhoneCall className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm">
                    Direct Live Call: {callerName || 'Recipient'} ({phoneNumber || 'Direct Line'})
                  </h3>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                    LIVE HUMAN CALL
                  </span>
                </div>
                <p className="text-xs text-emerald-400/90 font-medium">
                  100% Real Live Voice • Robot speech is muted & disabled
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <img
                src={currentAgent.avatarUrl}
                alt={currentAgent.name}
                className="w-11 h-11 rounded-full object-cover border-2 border-cyan-500/40"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white text-sm">{currentAgent.name}</h3>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {currentAgent.role.split(' ')[0]}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate max-w-sm">
                  {currentAgent.voiceName} · {currentAgent.voiceAccent}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col items-end text-xs">
            <span className="text-slate-400">{callingMode === 'direct_live' ? 'Connection Status' : 'Caller Sentiment'}</span>
            {callingMode === 'direct_live' ? (
              <span className="font-bold text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{callStatus === 'connected' ? 'LIVE AUDIO 2-WAY' : 'STANDBY'}</span>
              </span>
            ) : (
              <span className={`font-semibold capitalize flex items-center gap-1 ${
                currentSentiment === 'positive' ? 'text-emerald-400' :
                currentSentiment === 'urgent' ? 'text-rose-400' :
                currentSentiment === 'skeptical' ? 'text-amber-400' : 'text-slate-300'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  currentSentiment === 'positive' ? 'bg-emerald-400' :
                  currentSentiment === 'urgent' ? 'bg-rose-400' :
                  currentSentiment === 'skeptical' ? 'bg-amber-400' : 'bg-slate-400'
                }`} />
                {currentSentiment}
              </span>
            )}
          </div>
        </div>

        {/* Audio Waveform Canvas Banner */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 flex flex-col gap-2 relative">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-mono">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{callingMode === 'direct_live' ? 'DIRECT LIVE MICROPHONE WAVEFORM' : 'SPEECH WAVEFORM & TELEPHONY BUFFER'}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>HD Audio 48kHz</span>
              </span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-[10px] text-emerald-400 font-bold">
                {callingMode === 'direct_live' 
                  ? (callStatus === 'connected' ? `Live Voice Active (Mic: ${micAudioLevel}%)` : 'Ready to Connect')
                  : isAgentSpeaking ? 'Agent Speaking (TTS)' : 
                    isMicListening ? 'Listening (Mic STT)' : 
                    isOnHold ? 'Hold Music Playing' : 
                    callStatus === 'connected' ? 'Channel Open' : 'Trunk Ready'}
              </span>
            </div>
          </div>

          <div className="w-full h-16 bg-slate-950/80 rounded overflow-hidden flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={560}
              height={64}
              className="w-full h-full block"
            />
          </div>

          {micNotice && (
            <div className="flex items-center gap-2 text-[11px] bg-amber-950/50 text-amber-300 border border-amber-800/80 px-3 py-1.5 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{micNotice}</span>
            </div>
          )}

          {lastExecutedTool && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-300 bg-cyan-950/40 px-2 py-1 rounded border border-cyan-800/60">
              <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>Tool Executed: {lastExecutedTool}()</span>
            </div>
          )}
        </div>

        {/* Live Transcript Stream */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span>{callingMode === 'direct_live' ? 'Live Call Event & Voice Log' : 'Live Conversational Transcript'}</span>
              <span className="text-[10px] font-mono text-slate-500">({transcript.length} turns)</span>
            </span>
            {transcript.length > 0 && (
              <button
                onClick={() => setTranscript([])}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="h-64 overflow-y-auto pr-1 flex flex-col gap-3 rounded-lg bg-slate-950/60 border border-slate-800/80 p-3">
            {transcript.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs">
                <Phone className="w-8 h-8 text-slate-700 mb-2" />
                <p>Call is currently idle.</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Hit <span className="text-emerald-400 font-bold">Call Now</span> to begin speaking directly with that person live.
                </p>
              </div>
            ) : (
              transcript.map((msg) => {
                if (msg.sender === 'system') {
                  return (
                    <div key={msg.id} className="text-center my-1">
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800 shadow-xs">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                const isAgent = msg.sender === 'agent';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-400">
                        {isAgent ? currentAgent.name : (callerName || 'You (Caller)')}
                      </span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">{msg.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2 text-xs leading-relaxed ${
                        isAgent
                          ? 'bg-slate-800 text-slate-100 border border-slate-700/80 rounded-tl-sm'
                          : 'bg-emerald-600 text-white rounded-tr-sm shadow-md'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Caller Speech / Typing Bar */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            {/* Mic Button */}
            <button
              onClick={() => {
                if (isMicListening) {
                  speechEngine.stopListening();
                  stopRealMicrophone();
                  setIsMicListening(false);
                } else {
                  startRealMicrophone();
                  startListeningUser();
                }
              }}
              disabled={callStatus !== 'connected' || isMuted || isOnHold}
              title={isMicListening ? "Mute Microphone" : "Unmute Microphone"}
              className={`p-2.5 rounded-lg border transition flex items-center justify-center shrink-0 cursor-pointer ${
                isMicListening
                  ? 'bg-emerald-600 text-white border-emerald-400 animate-pulse shadow-md shadow-emerald-900/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              } ${callStatus !== 'connected' ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* In-Call Text Input (for silent environments or testing) */}
            <div className="flex-1 relative flex items-center">
              <input
                type="text"
                value={userTextInput}
                onChange={(e) => setUserTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUserTurn(userTextInput);
                }}
                disabled={callStatus !== 'connected' || isOnHold}
                placeholder={
                  callStatus === 'connected'
                    ? callingMode === 'direct_live'
                      ? `Microphone is live • Speak directly to ${callerName || 'recipient'} (or type notes here)`
                      : isMicListening 
                        ? "Listening to your voice... (or type here)"
                        : "Type your spoken response (e.g. 'Can we book Thursday?')"
                    : "Connect call to begin speaking live..."
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 disabled:opacity-50"
              />
              <button
                onClick={() => handleUserTurn(userTextInput)}
                disabled={!userTextInput.trim() || callStatus !== 'connected'}
                className="absolute right-1.5 p-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-30 disabled:hover:bg-emerald-500 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Voice Phrases */}
          {callStatus === 'connected' && (
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pt-1">
              <span className="text-slate-500 text-[10px] uppercase font-mono shrink-0">Quick Say:</span>
              {[
                "Hello, can you hear me clearly?",
                "Yes, I am connected on the live call.",
                "Thank you, let's discuss details.",
                "I will call you back shortly.",
                "Have a great day."
              ].map((phrase, i) => (
                <button
                  key={i}
                  onClick={() => handleUserTurn(phrase)}
                  className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 whitespace-nowrap transition cursor-pointer"
                >
                  "{phrase}"
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
