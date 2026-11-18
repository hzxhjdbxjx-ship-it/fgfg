/**
 * Web Audio API synthesizer for phone telephony sounds:
 * - Genuine Dual-Tone Multi-Frequency (DTMF) keypad beeps
 * - Realistic Ringback tone (440Hz + 480Hz telecom standard)
 * - Call connect / disconnect chimes
 * - Soft synthesized hold music loop
 * - Web Audio voice cadence acoustic synthesizer fallback
 * - Cross-browser audio unlock mechanism for Chrome & Safari autoplay policies
 */

let audioCtx: AudioContext | null = null;
let masterVolume = 0.85;

export function setMasterAudioVolume(vol: number): void {
  masterVolume = Math.max(0, Math.min(1, vol));
}

export function getMasterAudioVolume(): number {
  return masterVolume;
}

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Explicit user-gesture unlock for Web Audio and SpeechSynthesis.
 * Browsers block audio until a click or touch event occurs.
 */
export function unlockAudioAndSpeech(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Play an inaudible micro-buffer to satisfy Chrome/Safari autoplay policies
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // ignore
  }

  try {
    if ('speechSynthesis' in window && window.speechSynthesis) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  } catch {
    // ignore
  }
}

// Global mobile touch listeners to ensure audio context is unlocked on first touch
if (typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown'];
  const handleUserUnlock = () => {
    unlockAudioAndSpeech();
  };
  unlockEvents.forEach(evt => {
    window.addEventListener(evt, handleUserUnlock, { once: false, passive: true });
  });
}

// DTMF Frequency Table (Row x Column)
const DTMF_FREQS: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

/**
 * Play a realistic DTMF touch-tone
 */
export function playDtmfTone(key: string, durationMs = 140): void {
  const freqs = DTMF_FREQS[key];
  if (!freqs) return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freqs[0], now);
    osc2.frequency.setValueAtTime(freqs[1], now);

    const gainValue = 0.12 * masterVolume;

    // Smooth envelope to prevent audio clicking
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gainValue, now + 0.015);
    gainNode.gain.setValueAtTime(gainValue, now + durationMs / 1000 - 0.02);
    gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durationMs / 1000);
    osc2.stop(now + durationMs / 1000);
  } catch (e) {
    console.warn('Audio tone could not play', e);
  }
}

/**
 * Ringing tone controller (440Hz + 480Hz telecom standard)
 */
class RingbackPlayer {
  private isRinging = false;
  private timer: number | null = null;
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];

  start() {
    if (this.isRinging) return;
    this.isRinging = true;
    unlockAudioAndSpeech();

    const playRingCycle = () => {
      if (!this.isRinging) return;
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const ringDuration = 1.6;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        const gainValue = 0.09 * masterVolume;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainValue, now + 0.05);
        gain.gain.setValueAtTime(gainValue, now + ringDuration - 0.05);
        gain.gain.linearRampToValueAtTime(0, now + ringDuration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + ringDuration);
        osc2.stop(now + ringDuration);

        this.oscs.push(osc1, osc2);
        this.gains.push(gain);

        // Standard ring cycle
        this.timer = window.setTimeout(() => {
          playRingCycle();
        }, 3200);
      } catch (e) {
        console.warn('Ringback audio error', e);
      }
    };

    playRingCycle();
  }

  stop() {
    this.isRinging = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.oscs.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // already stopped
      }
    });
    this.oscs = [];
    this.gains.forEach(g => {
      try {
        g.disconnect();
      } catch {
        // already disconnected
      }
    });
    this.gains = [];
  }
}

export const ringback = new RingbackPlayer();

/**
 * Play a gentle ascending connect chime (C5 -> E5 -> G5)
 */
export function playConnectChime(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.24); // G5

    const gainVal = 0.12 * masterVolume;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (e) {
    console.warn('Connect chime error', e);
  }
}

/**
 * Play call ended descending tone
 */
export function playEndCallChime(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(330, now + 0.14);

    const gainVal = 0.12 * masterVolume;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {
    console.warn('End call chime error', e);
  }
}

/**
 * Procedural synthesizer for on-hold ambient elevator music
 */
class HoldMusicPlayer {
  private isPlaying = false;
  private interval: number | null = null;

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    const chords = [
      [261.63, 329.63, 392.00], // C
      [220.00, 261.63, 329.63], // Am
      [174.61, 220.00, 261.63], // F
      [196.00, 246.94, 293.66], // G
    ];

    let chordIdx = 0;
    const playNote = (freq: number, startDelay: number) => {
      if (!this.isPlaying) return;
      try {
        const ctx = getAudioContext();
        const now = ctx.currentTime + startDelay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        const gainVal = 0.04 * masterVolume;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainVal, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.9);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.95);
      } catch {
        // ignore
      }
    };

    const tick = () => {
      if (!this.isPlaying) return;
      const currentChord = chords[chordIdx % chords.length];
      playNote(currentChord[0], 0);
      playNote(currentChord[1], 0.25);
      playNote(currentChord[2], 0.5);
      playNote(currentChord[1] * 1.5, 0.75);
      chordIdx++;
    };

    tick();
    this.interval = window.setInterval(tick, 1100);
  }

  stop() {
    this.isPlaying = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const holdMusic = new HoldMusicPlayer();

/**
 * Web Audio speech synthesizer acoustic cadence generator.
 * Produces smooth natural voice-like acoustic cadence whenever speech synthesis is blocked
 * or as a vocal presence carrier wave, ensuring audible sound across all systems.
 */
export function playAcousticVoiceCadence(
  text: string, 
  gender: 'female' | 'male' = 'female',
  onEnd?: () => void
): () => void {
  let isCancelled = false;
  const ctx = getAudioContext();
  const baseFreq = gender === 'female' ? 240 : 130;
  
  // Estimate syllables from word count
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);
  const durationPerWord = 0.24;
  const totalDuration = Math.min(6.5, wordCount * durationPerWord);

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3.5, now);

    // Formant frequency motion
    const formant1 = gender === 'female' ? 850 : 500;
    filter.frequency.setValueAtTime(formant1, now);

    const gainVal = 0.045 * masterVolume;
    gain.gain.setValueAtTime(0, now);

    // Modulate pitch and filter slightly per syllable for human-like speech contour
    for (let i = 0; i < wordCount && i < 25; i++) {
      const t = now + i * durationPerWord;
      const pitchInflection = baseFreq + Math.sin(i * 1.3) * (gender === 'female' ? 35 : 18);
      osc.frequency.setValueAtTime(pitchInflection, t);

      // Syllable volume envelope
      gain.gain.setValueAtTime(0.005 * masterVolume, t);
      gain.gain.linearRampToValueAtTime(gainVal, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.005 * masterVolume, t + durationPerWord - 0.02);

      // Formant shift
      const nextFormant = (i % 2 === 0 ? 1100 : 750) + (gender === 'female' ? 200 : 0);
      filter.frequency.setValueAtTime(nextFormant, t + 0.05);
    }

    gain.gain.setValueAtTime(0, now + totalDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + totalDuration + 0.05);

    const timer = window.setTimeout(() => {
      if (!isCancelled) {
        onEnd?.();
      }
    }, totalDuration * 1000);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    };
  } catch {
    onEnd?.();
    return () => {};
  }
}

/**
 * Generates a persistent PCM WAV audio Data URL for voice prompts or when no hardware microphone is attached.
 */
export function createWavVoiceNoteDataUrl(durationSeconds = 6): string {
  const sampleRate = 22050;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat 1 = PCM
  view.setUint16(22, 1, true); // NumChannels = 1 (Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Generate pleasant voice frequency acoustic cadence
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.sin((Math.PI * (i % sampleRate)) / sampleRate);
    const wave = 0.3 * Math.sin(2 * Math.PI * 440 * t) + 0.15 * Math.sin(2 * Math.PI * 880 * t);
    const sample = Math.max(-1, Math.min(1, wave * envelope));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }

  // Convert array buffer to base64
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}
