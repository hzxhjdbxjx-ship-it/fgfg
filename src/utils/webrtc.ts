/**
 * Real-Time WebRTC & WebSocket Signaling Telephony Manager
 * Connects over /ws/signaling for real peer-to-peer two-way original voice calls
 * across tabs, browsers, and mobile devices inside the app.
 */

export interface TurnServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

export interface OnlinePeer {
  clientId: string;
  phone: string;
  name: string;
  connectedAt: number;
}

export interface IncomingCallOffer {
  callId: string;
  fromClientId: string;
  callerNumber: string;
  callerName: string;
  targetNumber: string;
  sdp: RTCSessionDescriptionInit;
  timestamp: number;
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export interface WebRTCDiagnosticResult {
  secureContext: { pass: boolean; protocol: string; message: string };
  webrtcSupported: { pass: boolean; message: string };
  micPermission: { pass: boolean; state: 'granted' | 'prompt' | 'denied' | 'unsupported'; message: string };
  stunConnectivity: { pass: boolean; iceCandidateCount: number; candidateTypes: string[]; latencyMs: number; message: string };
  audioInputDevice: { pass: boolean; deviceLabel: string; message: string };
  signalingReady: { pass: boolean; message: string };
  turnConfigured: { pass: boolean; serverUrl: string; message: string };
  overallPass: boolean;
}

export interface WebRTCConnectionStats {
  connectionState: RTCPeerConnectionState | 'idle';
  iceConnectionState: RTCIceConnectionState | 'idle';
  iceGatheringState: RTCIceGatheringState | 'idle';
  signalingState: RTCSignalingState | 'idle';
  selectedCandidateType: string;
  roundTripTimeMs: number;
  audioPacketsSent: number;
  audioPacketsReceived: number;
  audioLevel: number;
}

export interface WebRTCEventListener {
  onStateChange?: (state: RTCPeerConnectionState) => void;
  onIceStateChange?: (iceState: RTCIceConnectionState) => void;
  onAudioLevel?: (level: number) => void;
  onDiagnosticsLog?: (log: { time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }) => void;
  onSocketStatusChange?: (connected: boolean, clientId: string | null) => void;
  onOnlinePeersChange?: (peers: OnlinePeer[]) => void;
  onIncomingCall?: (offer: IncomingCallOffer) => void;
  onCallRinging?: (info: { callId: string; targetClientId: string; targetNumber: string; targetName: string }) => void;
  onCallConnected?: (info: { callId: string; peerNumber: string; peerName: string }) => void;
  onCallRejected?: (info: { callId: string; reason: string }) => void;
  onPeerOffline?: (info: { callId: string; targetNumber: string; reason: string }) => void;
  onCallEnded?: (info: { callId: string; reason?: string }) => void;
}

export class WebRTCManager {
  public peerConnection: RTCPeerConnection | null = null;
  public localStream: MediaStream | null = null;
  public remoteStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioLevelInterval: number | null = null;

  public iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS;
  public customTurnServer: TurnServerConfig | null = null;

  public connectionState: RTCPeerConnectionState = 'new';
  public iceConnectionState: RTCIceConnectionState = 'new';
  public lastError: string | null = null;
  public candidateTypes: Set<string> = new Set();
  public latencyMs: number = 0;

  // Real WebSocket Signaling State
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  public wsConnected: boolean = false;
  public socketId: string = 'connecting...';
  public remoteSocketId: string = '';
  public registeredPhone: string = '';
  public registeredName: string = 'Original Call User';
  public onlinePeers: OnlinePeer[] = [];

  // Active call tracking
  public activeCallId: string | null = null;
  public activeRemoteClientId: string | null = null;
  public activePeerNumber: string = '';
  public activePeerName: string = '';
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  private listeners = new Set<WebRTCEventListener>();
  private legacyCallbackSlot: WebRTCEventListener | null = null;

  constructor() {
    this.loadCustomTurnConfig();
  }

  public subscribe(listener: WebRTCEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setCallbacks(options: WebRTCEventListener) {
    if (this.legacyCallbackSlot) {
      this.listeners.delete(this.legacyCallbackSlot);
    }
    this.legacyCallbackSlot = options;
    this.listeners.add(options);
  }

  private emit<K extends keyof WebRTCEventListener>(
    event: K,
    ...args: Parameters<NonNullable<WebRTCEventListener[K]>>
  ) {
    this.listeners.forEach((listener) => {
      const fn = listener[event] as ((...a: any[]) => void) | undefined;
      if (fn) {
        try {
          fn(...args);
        } catch (err) {
          console.warn(`WebRTC listener error (${String(event)}):`, err);
        }
      }
    });
  }

  private log(text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.emit('onDiagnosticsLog', { time, text, type });
  }

  private loadCustomTurnConfig() {
    try {
      const saved = localStorage.getItem('applet_webrtc_turn_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.urls) {
          this.customTurnServer = parsed;
          this.updateIceServers();
        }
      }
    } catch {}
  }

  public setCustomTurn(turnConfig: TurnServerConfig | null) {
    this.customTurnServer = turnConfig;
    try {
      if (turnConfig) {
        localStorage.setItem('applet_webrtc_turn_config', JSON.stringify(turnConfig));
      } else {
        localStorage.removeItem('applet_webrtc_turn_config');
      }
    } catch {}
    this.updateIceServers();
  }

  private updateIceServers() {
    if (this.customTurnServer && this.customTurnServer.urls) {
      const customEntry: RTCIceServer = {
        urls: this.customTurnServer.urls,
        username: this.customTurnServer.username || undefined,
        credential: this.customTurnServer.credential || undefined
      };
      this.iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        customEntry,
        ...DEFAULT_ICE_SERVERS
      ];
      this.log(`Configured custom TURN server: ${this.customTurnServer.urls}`, 'info');
    } else {
      this.iceServers = DEFAULT_ICE_SERVERS;
    }
  }

  /**
   * Connect (or ensure connection) to real /ws/signaling WebSocket server
   */
  public connectSignaling(myPhone?: string, myName?: string) {
    if (typeof window === 'undefined') return;
    if (myPhone !== undefined) this.registeredPhone = myPhone.trim();
    if (myName !== undefined) this.registeredName = myName.trim() || 'Original Call User';

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN && this.registeredPhone) {
        this.registerNumber(this.registeredPhone, this.registeredName);
      }
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/signaling`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.wsConnected = true;
        this.log(`✓ Connected to signaling server (${wsUrl})`, 'success');
        this.emit('onSocketStatusChange', true, this.socketId);

        if (this.registeredPhone) {
          this.registerNumber(this.registeredPhone, this.registeredName);
        }

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 20000);
      };

      ws.onmessage = async (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        await this.handleServerMessage(msg);
      };

      ws.onclose = () => {
        this.wsConnected = false;
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        this.emit('onSocketStatusChange', false, null);
        this.log('Signaling WebSocket closed; reconnecting in 2.5s...', 'warn');
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => {
          this.connectSignaling();
        }, 2500);
      };

      ws.onerror = () => {
        this.wsConnected = false;
        this.emit('onSocketStatusChange', false, null);
      };
    } catch (err: any) {
      this.log(`WebSocket init error: ${err?.message || err}`, 'error');
    }
  }

  public registerNumber(phone: string, name?: string) {
    const cleanPhone = phone.trim();
    const cleanName = (name || this.registeredName || 'Original Call User').trim();
    this.registeredPhone = cleanPhone;
    this.registeredName = cleanName;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'REGISTER_NUMBER',
        phone: cleanPhone,
        name: cleanName
      }));
      this.log(`Registered in-app number: ${cleanPhone || '(unregistered)'}`, 'info');
    } else {
      this.connectSignaling(cleanPhone, cleanName);
    }
  }

  public sendSignalingMessage(payload: Record<string, any>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log(`Cannot send ${payload.type}: Signaling WebSocket not connected.`, 'error');
      return false;
    }
    this.ws.send(JSON.stringify(payload));
    this.log(`Signaling OUT: ${payload.type}`, 'info');
    return true;
  }

  private async handleServerMessage(msg: any) {
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'WELCOME') {
      this.socketId = msg.clientId;
      this.onlinePeers = Array.isArray(msg.peers) ? msg.peers : [];
      this.emit('onSocketStatusChange', true, this.socketId);
      this.emit('onOnlinePeersChange', this.getOtherOnlinePeers());
      if (this.registeredPhone) {
        this.registerNumber(this.registeredPhone, this.registeredName);
      }
      return;
    }

    if (msg.type === 'REGISTERED') {
      this.log(`✓ Number ${msg.phone} registered and reachable for incoming calls.`, 'success');
      return;
    }

    if (msg.type === 'ONLINE_PEERS') {
      this.onlinePeers = Array.isArray(msg.peers) ? msg.peers : [];
      this.emit('onOnlinePeersChange', this.getOtherOnlinePeers());
      return;
    }

    if (msg.type === 'INCOMING_CALL') {
      this.log(`📞 INCOMING CALL from ${msg.callerName} (${msg.callerNumber})`, 'success');
      this.emit('onIncomingCall', {
        callId: msg.callId,
        fromClientId: msg.fromClientId,
        callerNumber: msg.callerNumber,
        callerName: msg.callerName,
        targetNumber: msg.targetNumber,
        sdp: msg.sdp,
        timestamp: msg.timestamp
      });
      return;
    }

    if (msg.type === 'CALL_RINGING') {
      this.remoteSocketId = msg.targetClientId;
      this.activeRemoteClientId = msg.targetClientId;
      this.log(`Remote device (${msg.targetNumber}) is actively ringing...`, 'info');
      this.emit('onCallRinging', {
        callId: msg.callId,
        targetClientId: msg.targetClientId,
        targetNumber: msg.targetNumber,
        targetName: msg.targetName
      });
      return;
    }

    if (msg.type === 'CALL_PEER_OFFLINE') {
      this.log(`Peer offline: ${msg.reason}`, 'warn');
      this.cleanupMediaAndPeer();
      this.emit('onPeerOffline', {
        callId: msg.callId,
        targetNumber: msg.targetNumber,
        reason: msg.reason
      });
      return;
    }

    if (msg.type === 'CALL_ANSWER') {
      if (this.peerConnection && msg.callId === this.activeCallId && msg.sdp) {
        this.activeRemoteClientId = msg.fromClientId;
        this.remoteSocketId = msg.fromClientId;
        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await this.flushPendingIceCandidates();
          this.log('✓ Remote callee answered call! WebRTC voice stream active.', 'success');
          this.emit('onCallConnected', {
            callId: msg.callId,
            peerNumber: msg.answererNumber || this.activePeerNumber,
            peerName: msg.answererName || this.activePeerName
          });
        } catch (err: any) {
          this.log(`Failed applying CALL_ANSWER: ${err?.message || err}`, 'error');
        }
      }
      return;
    }

    if (msg.type === 'CALL_REJECT') {
      if (msg.callId === this.activeCallId) {
        this.log(`Call declined: ${msg.reason}`, 'warn');
        this.cleanupMediaAndPeer();
        this.emit('onCallRejected', {
          callId: msg.callId,
          reason: msg.reason || 'Declined by recipient'
        });
      }
      return;
    }

    if (msg.type === 'CALL_END') {
      if (!this.activeCallId || msg.callId === this.activeCallId) {
        this.log('Remote party ended the call.', 'info');
        const endedCallId = this.activeCallId || msg.callId;
        this.cleanupMediaAndPeer();
        this.emit('onCallEnded', { callId: endedCallId, reason: 'Remote party hung up' });
      }
      return;
    }

    if (msg.type === 'ICE_CANDIDATE' && msg.candidate) {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (err) {
          console.warn('ICE candidate add note:', err);
        }
      } else {
        this.pendingIceCandidates.push(msg.candidate);
      }
    }
  }

  private async flushPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      }
    }
  }

  public getOtherOnlinePeers(): OnlinePeer[] {
    return this.onlinePeers.filter((p) => p.clientId !== this.socketId);
  }

  /**
   * 1. Real Microphone Check (never fakes success or fabricates audio)
   */
  public async checkMicrophone(): Promise<MediaStream> {
    this.log('Requesting hardware microphone via navigator.mediaDevices.getUserMedia...', 'info');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('Microphone MediaDevices API is unavailable in this browser or non-HTTPS context.');
      this.lastError = err.message;
      this.log(`MIC ERROR: ${err.message}`, 'error');
      throw err;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      this.log('MIC OK: Real hardware microphone active.', 'success');
      this.localStream = stream;
      this.lastError = null;
      this.setupAudioAnalysis(stream);
      return stream;
    } catch (error: any) {
      const msg = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
        ? 'Microphone permission denied. Allow microphone access in browser settings to make real calls.'
        : error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError'
        ? 'No hardware microphone detected on this device.'
        : `Microphone error: ${error?.message || 'Access failed'}`;
      this.lastError = msg;
      this.log(`MIC ERROR: ${msg}`, 'error');
      throw new Error(msg);
    }
  }

  /**
   * Bind incoming remote stream to DOM <audio> elements cleanly
   */
  private bindRemoteStreamToAudioElements(stream: MediaStream) {
    this.remoteStream = stream;
    const ids = ['globalRemoteAudio', 'remoteAudio'];
    ids.forEach((id) => {
      const el = document.getElementById(id) as HTMLAudioElement | null;
      if (el) {
        el.srcObject = stream;
        el.play().catch((err) => {
          console.warn(`Audio element ${id}.play() blocked until interaction:`, err);
        });
      }
    });
  }

  private createPeerConnection(callId: string, targetClientId?: string, targetNumber?: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 2
    });

    this.peerConnection = pc;
    this.candidateTypes.clear();
    this.pendingIceCandidates = [];

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
      this.log('Attached real local Opus 48kHz audio track to PeerConnection.', 'info');
    }

    pc.ontrack = (event) => {
      this.log(`✓ Remote voice audio track received (${event.track.kind})`, 'success');
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.bindRemoteStreamToAudioElements(stream);
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      this.iceConnectionState = state;
      this.emit('onIceStateChange', state);
      if (state === 'checking') {
        this.log('ICE: checking connectivity...', 'info');
      } else if (state === 'connected' || state === 'completed') {
        this.log(`ICE: ${state} — Direct peer audio established!`, 'success');
      } else if (state === 'failed') {
        this.log('ICE: failed — STUN/TURN traversal could not reach peer.', 'error');
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.connectionState = state;
      this.emit('onStateChange', state);
      this.log(`PeerConnection state: ${state.toUpperCase()}`, state === 'connected' ? 'success' : 'info');
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (event.candidate.type) {
          this.candidateTypes.add(event.candidate.type);
        }
        this.sendSignalingMessage({
          type: 'ICE_CANDIDATE',
          callId,
          targetClientId: targetClientId || this.activeRemoteClientId || undefined,
          targetNumber: targetNumber || this.activePeerNumber || undefined,
          candidate: event.candidate.toJSON()
        });
      }
    };

    return pc;
  }

  /**
   * CALLER: Place a genuine in-app WebRTC call over /ws/signaling
   */
  public async startOutgoingCall(options: {
    peerNumber: string;
    peerName: string;
    targetClientId?: string;
    callerNumber?: string;
    callerName?: string;
  }): Promise<string> {
    if (!this.wsConnected) {
      throw new Error('Signaling server is connecting or offline. Please wait a moment and try again.');
    }

    await this.checkMicrophone();

    const callId = `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.activeCallId = callId;
    this.activePeerNumber = options.peerNumber;
    this.activePeerName = options.peerName;
    this.activeRemoteClientId = options.targetClientId || null;

    const pc = this.createPeerConnection(callId, options.targetClientId, options.peerNumber);

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });
    await pc.setLocalDescription(offer);

    const sent = this.sendSignalingMessage({
      type: 'CALL_OFFER',
      callId,
      targetNumber: options.peerNumber,
      targetClientId: options.targetClientId,
      callerNumber: options.callerNumber || this.registeredPhone || 'In-App Caller',
      callerName: options.callerName || this.registeredName || 'Original Call User',
      sdp: offer
    });

    if (!sent) {
      this.cleanupMediaAndPeer();
      throw new Error('Failed to send call offer to signaling server.');
    }

    this.log(`Dialing ${options.peerNumber} via WebRTC signaling...`, 'info');
    return callId;
  }

  /**
   * CALLEE: Answer a genuine incoming WebRTC call with real mic
   */
  public async answerIncomingCall(offer: IncomingCallOffer): Promise<void> {
    await this.checkMicrophone();

    this.activeCallId = offer.callId;
    this.activeRemoteClientId = offer.fromClientId;
    this.remoteSocketId = offer.fromClientId;
    this.activePeerNumber = offer.callerNumber;
    this.activePeerName = offer.callerName;

    const pc = this.createPeerConnection(offer.callId, offer.fromClientId, offer.callerNumber);
    await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
    await this.flushPendingIceCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignalingMessage({
      type: 'CALL_ANSWER',
      callId: offer.callId,
      toClientId: offer.fromClientId,
      sdp: answer
    });

    this.log(`✓ Answered incoming call from ${offer.callerNumber}`, 'success');
    this.emit('onCallConnected', {
      callId: offer.callId,
      peerNumber: offer.callerNumber,
      peerName: offer.callerName
    });
  }

  /**
   * CALLEE: Decline incoming call
   */
  public rejectIncomingCall(offer: IncomingCallOffer, reason = 'Call declined by recipient') {
    this.sendSignalingMessage({
      type: 'CALL_REJECT',
      callId: offer.callId,
      toClientId: offer.fromClientId,
      reason
    });
  }

  /**
   * Hang up active call and notify remote peer
   */
  public terminateCallSession() {
    if (this.activeCallId) {
      this.sendSignalingMessage({
        type: 'CALL_END',
        callId: this.activeCallId,
        targetClientId: this.activeRemoteClientId || undefined,
        targetNumber: this.activePeerNumber || undefined
      });
    }
    this.cleanupMediaAndPeer();
  }

  private cleanupMediaAndPeer() {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {}
      this.analyser = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }

    ['globalRemoteAudio', 'remoteAudio'].forEach((id) => {
      const el = document.getElementById(id) as HTMLAudioElement | null;
      if (el) el.srcObject = null;
    });

    this.remoteStream = null;
    this.activeCallId = null;
    this.activeRemoteClientId = null;
    this.pendingIceCandidates = [];
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    this.emit('onStateChange', 'closed');
    this.emit('onAudioLevel', 0);
  }

  public setMicrophoneMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      this.log(muted ? 'Microphone muted.' : 'Microphone unmuted.', 'info');
    }
  }

  private setupAudioAnalysis(stream: MediaStream) {
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      // @ts-ignore
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      if (this.audioLevelInterval) clearInterval(this.audioLevelInterval);

      this.audioLevelInterval = window.setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        this.emit('onAudioLevel', normalized);
      }, 100);
    } catch (e) {
      console.warn('Audio analysis setup warning:', e);
    }
  }

  public async runFullDiagnostics(): Promise<WebRTCDiagnosticResult> {
    const startTime = performance.now();
    const result: WebRTCDiagnosticResult = {
      secureContext: { pass: false, protocol: '', message: '' },
      webrtcSupported: { pass: false, message: '' },
      micPermission: { pass: false, state: 'prompt', message: '' },
      stunConnectivity: { pass: false, iceCandidateCount: 0, candidateTypes: [], latencyMs: 0, message: '' },
      audioInputDevice: { pass: false, deviceLabel: '', message: '' },
      signalingReady: {
        pass: this.wsConnected,
        message: this.wsConnected
          ? `WebSocket /ws/signaling connected (${this.socketId}) • ${this.getOtherOnlinePeers().length} other peer(s) online`
          : 'WebSocket /ws/signaling disconnected or reconnecting...'
      },
      turnConfigured: {
        pass: true,
        serverUrl: this.customTurnServer?.urls || 'turn:openrelay.metered.ca:80 (Default)',
        message: this.customTurnServer ? 'Custom TURN credentials active' : 'Default OpenRelay + Google STUN active'
      },
      overallPass: false
    };

    const isHttps = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isSecure = typeof window !== 'undefined' && !!window.isSecureContext;
    result.secureContext = {
      pass: isHttps || isSecure,
      protocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
      message: (isHttps || isSecure)
        ? 'HTTPS / Secure Context verified. WebRTC APIs unlocked.'
        : 'Insecure context detected. WebRTC requires HTTPS or localhost.'
    };

    const hasPeerConn = typeof window !== 'undefined' && 'RTCPeerConnection' in window;
    const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
    result.webrtcSupported = {
      pass: hasPeerConn && hasMediaDevices,
      message: hasPeerConn && hasMediaDevices
        ? 'Browser supports standard RTCPeerConnection and MediaDevices APIs.'
        : 'Browser does not support modern WebRTC APIs.'
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        // @ts-ignore
        const perm = await navigator.permissions.query({ name: 'microphone' });
        result.micPermission = {
          pass: perm.state === 'granted',
          state: perm.state,
          message: perm.state === 'granted'
            ? 'Microphone permission granted.'
            : perm.state === 'denied'
            ? 'Microphone permission denied in browser settings.'
            : 'Microphone permission will prompt when calling or testing mic.'
        };
      }
    } catch {
      result.micPermission = {
        pass: false,
        state: 'prompt',
        message: 'Click "1. Test Microphone" to verify hardware mic access.'
      };
    }

    try {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      const candidates: RTCIceCandidate[] = [];
      const types = new Set<string>();

      const stunPromise = new Promise<{ latency: number }>((resolve) => {
        const stunStart = performance.now();
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            candidates.push(e.candidate);
            if (e.candidate.type) types.add(e.candidate.type);
            if (e.candidate.type === 'srflx' || e.candidate.type === 'relay' || candidates.length >= 3) {
              resolve({ latency: Math.round(performance.now() - stunStart) });
            }
          } else {
            resolve({ latency: Math.round(performance.now() - stunStart) });
          }
        };
      });

      pc.createDataChannel('diagnostic_ping');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const timeoutPromise = new Promise<{ latency: number }>((resolve) =>
        setTimeout(() => resolve({ latency: Math.round(performance.now() - startTime) }), 2500)
      );

      const { latency } = await Promise.race([stunPromise, timeoutPromise]);
      pc.close();

      const candidateTypesList = Array.from(types);
      result.stunConnectivity = {
        pass: candidates.length > 0,
        iceCandidateCount: candidates.length,
        candidateTypes: candidateTypesList,
        latencyMs: latency,
        message: candidates.length > 0
          ? `STUN/TURN reached (${latency}ms, types: ${candidateTypesList.join(', ')}).`
          : 'No ICE candidates gathered (check network firewall).'
      };
    } catch (e: any) {
      result.stunConnectivity = {
        pass: false,
        iceCandidateCount: 0,
        candidateTypes: [],
        latencyMs: 0,
        message: `STUN ICE check failed: ${e?.message || 'Network blocked'}`
      };
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        result.audioInputDevice = {
          pass: audioInputs.length > 0,
          deviceLabel: audioInputs[0]?.label || (audioInputs.length > 0 ? `${audioInputs.length} microphone(s) detected` : 'No microphone found'),
          message: `${audioInputs.length} audio input device(s) detected.`
        };
      }
    } catch {}

    result.overallPass = result.secureContext.pass && result.webrtcSupported.pass && result.signalingReady.pass;
    return result;
  }

  public async getStats(): Promise<WebRTCConnectionStats> {
    let rtt = this.latencyMs;
    let packetsSent = 0;
    let packetsReceived = 0;

    if (this.peerConnection) {
      try {
        const stats = await this.peerConnection.getStats();
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            packetsSent = report.packetsSent || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetsReceived = report.packetsReceived || 0;
          }
        });
      } catch {}
    }

    return {
      connectionState: this.peerConnection ? this.peerConnection.connectionState : 'idle',
      iceConnectionState: this.peerConnection ? this.peerConnection.iceConnectionState : 'idle',
      iceGatheringState: this.peerConnection ? this.peerConnection.iceGatheringState : 'idle',
      signalingState: this.peerConnection ? this.peerConnection.signalingState : 'idle',
      selectedCandidateType: Array.from(this.candidateTypes).join(', ') || 'none',
      roundTripTimeMs: rtt,
      audioPacketsSent: packetsSent,
      audioPacketsReceived: packetsReceived,
      audioLevel: 0
    };
  }
}

export const webrtcManager = new WebRTCManager();
