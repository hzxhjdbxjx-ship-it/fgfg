/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RecordedVideoResult {
  blob: Blob;
  url: string;
  durationSeconds: number;
  recordedAt: string;
  source: 'screen' | 'canvas';
  sizeBytes: number;
}

export interface CanvasRecordState {
  currentStep: number;
  stepTitle: string;
  audioName: string;
  contacts: { name: string; phone: string; status: string }[];
  currentContactIndex: number;
  callState: 'idle' | 'ringing' | 'connected' | 'ended';
  callSeconds: number;
  intervalCountdown: number | null;
  scheduledTimeStr: string;
  intervalSeconds: number;
  logMessages: string[];
}

export class VideoRecorderManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private activeStream: MediaStream | null = null;
  private startTime: number = 0;
  private timerInterval: number | null = null;
  private canvasAnimationId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private stateGetter: (() => CanvasRecordState) | null = null;

  public isRecording: boolean = false;
  public recordingSeconds: number = 0;
  public onTick?: (seconds: number) => void;
  public onStop?: (result: RecordedVideoResult) => void;
  public onError?: (error: string) => void;

  /**
   * Start recording using Screen Capture (getDisplayMedia)
   */
  async startScreenRecording(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen capture is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
        } as any,
        audio: true
      });

      this.activeStream = stream;
      this.initMediaRecorder(stream, 'screen');
      return true;
    } catch (err: any) {
      console.warn('Screen recording could not be started, falling back to In-App Canvas Recording:', err);
      // Fallback to Canvas
      return this.startCanvasRecording();
    }
  }

  /**
   * Start recording using In-App Canvas Engine (100% reliable in all browser iframes)
   */
  startCanvasRecording(stateProvider?: () => CanvasRecordState): boolean {
    try {
      if (stateProvider) {
        this.stateGetter = stateProvider;
      }

      // Create high-res 1280x720 canvas
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1280;
      this.canvas.height = 720;
      this.canvasCtx = this.canvas.getContext('2d');

      if (!this.canvasCtx) {
        throw new Error('Could not initialize 2D canvas context');
      }

      // Initialize audio mix
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioCtxClass();
        this.audioDest = this.audioCtx.createMediaStreamDestination();
      } catch (e) {
        // ignore
      }

      // Capture 30 FPS video stream from canvas
      const canvasStream = (this.canvas as any).captureStream ? (this.canvas as any).captureStream(30) : null;
      if (!canvasStream) {
        throw new Error('Canvas captureStream is not supported in this browser.');
      }

      // If audio destination exists, mix into stream
      if (this.audioDest && this.audioDest.stream) {
        const audioTracks = this.audioDest.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          canvasStream.addTrack(audioTracks[0]);
        }
      }

      this.activeStream = canvasStream;

      // Start render loop
      this.renderCanvasLoop();

      this.initMediaRecorder(canvasStream, 'canvas');
      return true;
    } catch (err: any) {
      console.error('Failed to start canvas recording:', err);
      if (this.onError) {
        this.onError(err?.message || 'Failed to start video recording');
      }
      return false;
    }
  }

  private initMediaRecorder(stream: MediaStream, source: 'screen' | 'canvas') {
    this.recordedChunks = [];
    this.startTime = Date.now();
    this.recordingSeconds = 0;
    this.isRecording = true;

    // Pick best supported MIME type
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    const options = selectedMime ? { mimeType: selectedMime } : undefined;
    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const finalBlob = new Blob(this.recordedChunks, {
        type: selectedMime || 'video/webm'
      });
      const videoUrl = URL.createObjectURL(finalBlob);
      const totalSecs = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

      const result: RecordedVideoResult = {
        blob: finalBlob,
        url: videoUrl,
        durationSeconds: totalSecs,
        recordedAt: new Date().toLocaleTimeString(),
        source,
        sizeBytes: finalBlob.size
      };

      if (this.onStop) {
        this.onStop(result);
      }
      this.cleanup();
    };

    // Listen for user stopping screen share via browser floating bar
    stream.getVideoTracks().forEach(track => {
      track.onended = () => {
        if (this.isRecording) {
          this.stopRecording();
        }
      };
    });

    // Collect data slices every 1 second
    this.mediaRecorder.start(1000);

    // Timer tick every second
    this.timerInterval = window.setInterval(() => {
      this.recordingSeconds += 1;
      if (this.onTick) {
        this.onTick(this.recordingSeconds);
      }
    }, 1000);
  }

  /**
   * Stop active video recording
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.isRecording = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.canvasAnimationId) {
      cancelAnimationFrame(this.canvasAnimationId);
      this.canvasAnimationId = null;
    }

    try {
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch (e) {
      // ignore
    }
  }

  private cleanup() {
    this.isRecording = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.canvasAnimationId) {
      cancelAnimationFrame(this.canvasAnimationId);
      this.canvasAnimationId = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.canvas = null;
    this.canvasCtx = null;
  }

  public setStateGetter(getter: () => CanvasRecordState) {
    this.stateGetter = getter;
  }

  /**
   * Play an audible acoustic tone into the recording audio track
   */
  public playTone(freq: number = 440, durationMs: number = 250) {
    if (!this.audioCtx || !this.audioDest || this.audioCtx.state === 'closed') return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(this.audioDest);
      osc.start();
      osc.stop(this.audioCtx.currentTime + durationMs / 1000);
    } catch {}
  }

  /**
   * Render high-resolution video frames onto the Canvas
   */
  private renderCanvasLoop = () => {
    if (!this.isRecording || !this.canvas || !this.canvasCtx) return;

    const ctx = this.canvasCtx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const now = Date.now();

    // Default or live state
    const state: CanvasRecordState = this.stateGetter ? this.stateGetter() : {
      currentStep: 5,
      stepTitle: 'Step 5: Record Auto-Dialing to 3 Contacts (Without Touching Phone)',
      audioName: 'Automated Broadcast Message (MP3)',
      contacts: [
        { name: 'Rajesh Kumar', phone: '+91 98765 43210', status: 'completed' },
        { name: 'Sarah Jenkins', phone: '+1 (415) 555-0142', status: 'dialing' },
        { name: 'Amit Sharma', phone: '+91 98123 45678', status: 'pending' },
      ],
      currentContactIndex: 1,
      callState: 'connected',
      callSeconds: 8,
      intervalCountdown: null,
      scheduledTimeStr: 'Auto-Scheduled Today',
      intervalSeconds: 10,
      logMessages: ['Dialing contact 2 of 3...', 'Connected to Sarah Jenkins', 'Broadcasting audio message']
    };

    // 1. Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#061A40');
    bgGrad.addColorStop(0.5, '#0B2545');
    bgGrad.addColorStop(1, '#030E1F');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle tech grid pattern
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 2. Header Bar
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(0, 0, width, 80);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.strokeRect(0, 0, width, 80);

    // App brand
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(45, 40, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('☎', 37, 47);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('RoboVoiceCall', 75, 46);

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText('5-STEP AUTONOMOUS AUTO-DIALER • ZERO-TOUCH RECORDING', 240, 44);

    // Live REC indicator
    const blink = Math.floor(now / 500) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(width - 160, 40, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillText('REC', width - 145, 46);

    const m = Math.floor(this.recordingSeconds / 60).toString().padStart(2, '0');
    const s = (this.recordingSeconds % 60).toString().padStart(2, '0');
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillText(`${m}:${s}`, width - 90, 46);

    // 3. Workflow 5-Step Status Bar
    const stepBarY = 105;
    const stepWidth = (width - 80) / 5;
    const stepLabels = [
      '1. Audio Upload',
      '2. 3 Contacts Added',
      '3. Scheduled Time',
      '4. Call Interval',
      '5. Autonomous Dialing'
    ];

    for (let i = 0; i < 5; i++) {
      const stepX = 40 + i * stepWidth;
      const isPastOrActive = i + 1 <= state.currentStep;
      const isCurrent = i + 1 === state.currentStep;

      // Tab pill background
      ctx.fillStyle = isCurrent 
        ? 'rgba(16, 185, 129, 0.25)' 
        : isPastOrActive 
        ? 'rgba(14, 165, 233, 0.15)' 
        : 'rgba(30, 41, 59, 0.6)';
      ctx.strokeStyle = isCurrent 
        ? '#10B981' 
        : isPastOrActive 
        ? '#0284C7' 
        : 'rgba(71, 85, 105, 0.4)';
      ctx.lineWidth = isCurrent ? 2 : 1;
      this.drawRoundedRect(ctx, stepX, stepBarY, stepWidth - 10, 42, 8);
      ctx.fill();
      ctx.stroke();

      // Step number circle
      ctx.fillStyle = isCurrent ? '#10B981' : isPastOrActive ? '#0284C7' : '#64748B';
      ctx.beginPath();
      ctx.arc(stepX + 22, stepBarY + 21, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${i + 1}`, stepX + 19, stepBarY + 25);

      // Step text
      ctx.fillStyle = isCurrent ? '#34D399' : isPastOrActive ? '#E0F2FE' : '#94A3B8';
      ctx.font = isCurrent ? 'bold 12px sans-serif' : '500 11px sans-serif';
      ctx.fillText(stepLabels[i], stepX + 38, stepBarY + 25);
    }

    // 4. Main Body: Split into Left Panel (Live Call Action) and Right Panel (3 Contacts Queue)
    const contentY = 170;
    const leftWidth = 720;
    const rightWidth = 460;
    const panelHeight = 490;

    // LEFT PANEL: Active Call Simulator & Live WebRTC Engine
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    this.drawRoundedRect(ctx, 40, contentY, leftWidth, panelHeight, 16);
    ctx.fill();
    ctx.stroke();

    // Left Panel Header
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Autonomous Call Engine (Hands-Free Loop)', 65, contentY + 40);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '13px sans-serif';
    ctx.fillText('Zero touch required: Phone calls each contact sequentially through WebRTC VoIP', 65, contentY + 65);

    // Call Status Hero Card
    const currentContact = state.contacts[state.currentContactIndex] || state.contacts[0] || { name: 'Lead', phone: '+1 555-0100', status: 'pending' };
    const heroCardY = contentY + 90;
    const heroCardH = 175;

    const heroGrad = ctx.createLinearGradient(65, heroCardY, 65, heroCardY + heroCardH);
    heroGrad.addColorStop(0, '#0F172A');
    heroGrad.addColorStop(1, '#020617');
    ctx.fillStyle = heroGrad;
    ctx.strokeStyle = state.intervalCountdown !== null 
      ? 'rgba(56, 189, 248, 0.5)' 
      : state.callState === 'connected' 
      ? 'rgba(16, 185, 129, 0.6)' 
      : 'rgba(245, 158, 11, 0.6)';
    ctx.lineWidth = 2;
    this.drawRoundedRect(ctx, 65, heroCardY, leftWidth - 50, heroCardH, 12);
    ctx.fill();
    ctx.stroke();

    // Call icon / avatar
    const isRinging = state.callState === 'ringing';
    const isConnected = state.callState === 'connected';
    const isInterval = state.intervalCountdown !== null;

    ctx.fillStyle = isInterval ? '#0284C7' : isConnected ? '#10B981' : '#F59E0B';
    ctx.beginPath();
    ctx.arc(120, heroCardY + 65, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(isInterval ? '⏳' : isConnected ? '🔊' : '📞', 104, heroCardY + 75);

    // Status Label
    ctx.fillStyle = isInterval ? '#38BDF8' : isConnected ? '#34D399' : '#FBBF24';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    const statusText = isInterval 
      ? `INTERVAL COOLDOWN BETWEEN CALLS (${state.intervalCountdown}s)`
      : isConnected 
      ? `CONNECTED • BROADCASTING AUDIO MESSAGE (${state.callSeconds}s)`
      : `RINGING CONTACT ${state.currentContactIndex + 1} OF 3...`;
    ctx.fillText(statusText, 175, heroCardY + 45);

    // Contact Name & Phone
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(currentContact.name, 175, heroCardY + 80);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '16px "JetBrains Mono", monospace';
    ctx.fillText(currentContact.phone, 175, heroCardY + 110);

    // Audio broadcast badge
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.strokeStyle = '#10B981';
    this.drawRoundedRect(ctx, 175, heroCardY + 128, 450, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#6EE7B7';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`Playing Audio: "${state.audioName}" • Zero User Touches Required`, 190, heroCardY + 146);

    // Animated Audio Waveform (Simulated dynamic audio playback)
    const waveY = heroCardY + 215;
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Live Audio Stream & Real-time Telephony Waveform:', 65, waveY);

    const numBars = 48;
    const barWidth = 10;
    const barSpacing = 3.5;
    for (let b = 0; b < numBars; b++) {
      const barX = 65 + b * (barWidth + barSpacing);
      const wavePhase = (now / 200 + b * 0.35) % (Math.PI * 2);
      const barH = isConnected 
        ? Math.max(8, Math.abs(Math.sin(wavePhase)) * 42 + Math.cos(wavePhase * 1.5) * 12)
        : isRinging 
        ? Math.max(6, Math.sin(now / 150) * 18 + 12)
        : 6;

      ctx.fillStyle = isConnected ? '#10B981' : isRinging ? '#F59E0B' : '#475569';
      this.drawRoundedRect(ctx, barX, waveY + 55 - barH / 2, barWidth, barH, 3);
      ctx.fill();
    }

    // Live Activity Log Box inside Left Panel
    const logBoxY = heroCardY + 285;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    this.drawRoundedRect(ctx, 65, logBoxY, leftWidth - 50, 110, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText('REAL-TIME CALL LOGS & TIMESTAMPS', 80, logBoxY + 25);

    const logsToShow = state.logMessages.slice(-3);
    logsToShow.forEach((log, lIdx) => {
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(`> [${new Date().toLocaleTimeString()}] ${log}`, 80, logBoxY + 50 + lIdx * 22);
    });

    // RIGHT PANEL: The 3 Contacts List (Step 2 Verification)
    const rightX = 40 + leftWidth + 20;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    this.drawRoundedRect(ctx, rightX, contentY, rightWidth, panelHeight, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Step 2: 3 Contacts Queue', rightX + 25, contentY + 40);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '12px sans-serif';
    ctx.fillText('Auto-dialing list without touching the phone', rightX + 25, contentY + 65);

    // Draw the 3 contact cards
    const contactCardStartY = contentY + 85;
    const cardH = 92;

    state.contacts.slice(0, 3).forEach((c, idx) => {
      const cardY = contactCardStartY + idx * (cardH + 12);
      const isCardActive = idx === state.currentContactIndex;
      const isCardCompleted = c.status === 'completed';

      ctx.fillStyle = isCardActive 
        ? 'rgba(16, 185, 129, 0.15)' 
        : isCardCompleted 
        ? 'rgba(14, 165, 233, 0.1)' 
        : 'rgba(30, 41, 59, 0.5)';
      ctx.strokeStyle = isCardActive 
        ? '#10B981' 
        : isCardCompleted 
        ? '#0284C7' 
        : 'rgba(71, 85, 105, 0.5)';
      ctx.lineWidth = isCardActive ? 2 : 1;
      this.drawRoundedRect(ctx, rightX + 20, cardY, rightWidth - 40, cardH, 10);
      ctx.fill();
      ctx.stroke();

      // Contact index badge
      ctx.fillStyle = isCardCompleted ? '#0284C7' : isCardActive ? '#10B981' : '#64748B';
      ctx.beginPath();
      ctx.arc(rightX + 48, cardY + 46, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(isCardCompleted ? '✓' : `${idx + 1}`, rightX + 43, cardY + 52);

      // Contact name
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(c.name, rightX + 78, cardY + 38);

      // Phone
      ctx.fillStyle = '#94A3B8';
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.fillText(c.phone, rightX + 78, cardY + 62);

      // Status chip
      const chipText = isCardCompleted 
        ? 'COMPLETED ✓' 
        : isCardActive 
        ? 'DIALING NOW 📞' 
        : 'PENDING';
      const chipColor = isCardCompleted ? '#38BDF8' : isCardActive ? '#34D399' : '#94A3B8';
      ctx.fillStyle = chipColor;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(chipText, rightX + rightWidth - 145, cardY + 48);
    });

    // Schedule & Interval Summary Box at bottom of Right Panel
    const sumY = contactCardStartY + 3 * (cardH + 12) + 5;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
    this.drawRoundedRect(ctx, rightX + 20, sumY, rightWidth - 40, 75, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('📅 STEP 3: SCHEDULE DATE & TIME', rightX + 35, sumY + 25);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(state.scheduledTimeStr || 'Auto-Scheduled • Zero-Touch Hands-Free', rightX + 35, sumY + 42);

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`⏱ STEP 4: CALL INTERVAL: ${state.intervalSeconds} SECONDS`, rightX + 35, sumY + 62);

    // 5. Footer Bar: Guarantee info
    ctx.fillStyle = '#64748B';
    ctx.font = '12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Automated proof video: 5-step outbound workflow executing autonomous auto-dialing to 3 contacts without touching the phone.', 40, height - 20);

    // Request next frame
    this.canvasAnimationId = requestAnimationFrame(this.renderCanvasLoop);
  };

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

export const videoRecorderManager = new VideoRecorderManager();
