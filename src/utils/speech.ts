/**
 * Robust Speech Recognition (STT) and Speech Synthesis (TTS) Engine
 * - Microphone speech capture with continuous / interim detection
 * - Voice speech generation with cross-browser Chrome/Safari keepalive
 * - Acoustic vocal cadence fallback when system TTS is muted or uninstalled
 * - Dynamic voice selection across female/male profiles and accents
 */

import { unlockAudioAndSpeech, playAcousticVoiceCadence, getMasterAudioVolume } from './audio';

interface IWindowSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export class SpeechEngine {
  private recognition: any | null = null;
  private synthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isListening = false;
  private voices: SpeechSynthesisVoice[] = [];
  private keepAliveTimer: number | null = null;
  private stopAcousticFallback: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Speech Recognition initialization
      const win = window as unknown as IWindowSpeech;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = 'en-US';
          this.recognition.maxAlternatives = 1;
        } catch (e) {
          console.warn('SpeechRecognition init error:', e);
        }
      }

      // Speech Synthesis initialization
      if ('speechSynthesis' in window) {
        this.synthesis = window.speechSynthesis;
        this.loadVoices();
        if (this.synthesis.onvoiceschanged !== undefined) {
          this.synthesis.onvoiceschanged = () => this.loadVoices();
        }
      }
    }
  }

  private loadVoices() {
    if (!this.synthesis) return;
    try {
      this.voices = this.synthesis.getVoices();
    } catch {
      this.voices = [];
    }
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!this.synthesis) return [];
    if (this.voices.length === 0) {
      this.loadVoices();
    }
    return this.voices;
  }

  public isSpeechRecognitionSupported(): boolean {
    return !!this.recognition;
  }

  public isSpeechSynthesisSupported(): boolean {
    return !!this.synthesis;
  }

  /**
   * Start listening to caller's microphone
   */
  public startListening(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError?: (err: string) => void
  ) {
    if (!this.recognition) {
      onError?.('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      unlockAudioAndSpeech();
      this.stopSpeaking();

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          onResult(finalTranscript.trim(), true);
        } else if (interimTranscript) {
          onResult(interimTranscript.trim(), false);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'audio-capture' || event.error === 'not-allowed') {
          this.isListening = false;
          console.warn('Microphone hardware unavailable or access denied:', event.error);
          onError?.(event.error === 'audio-capture' ? 'No microphone detected' : 'Microphone permission blocked');
          return;
        }

        if (event.error !== 'no-speech') {
          console.warn('Speech recognition status:', event.error);
          onError?.(event.error);
        }
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch {
            // Ignore restart collisions
          }
        }
      };

      this.isListening = true;
      this.recognition.start();
    } catch (e: any) {
      this.isListening = false;
      onError?.(e.message || 'Failed to access microphone');
    }
  }

  public stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Speak a text response aloud using native SpeechSynthesis with automatic keep-alive
   * and audible acoustic fallback.
   */
  public speak(
    text: string,
    options: {
      voiceName?: string;
      voiceGender?: 'female' | 'male';
      pitch?: number;
      rate?: number;
      volume?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    } = {}
  ): void {
    // Stop any ongoing speech
    this.stopSpeaking();

    // Ensure audio and speech contexts are unlocked
    unlockAudioAndSpeech();

    const masterVol = getMasterAudioVolume();
    const desiredVolume = options.volume !== undefined ? options.volume * masterVol : masterVol;

    // Fallback if SpeechSynthesis is unavailable
    if (!this.synthesis || desiredVolume <= 0.01) {
      options.onStart?.();
      this.stopAcousticFallback = playAcousticVoiceCadence(
        text, 
        options.voiceGender || 'female', 
        () => options.onEnd?.()
      );
      return;
    }

    try {
      if (this.synthesis.paused) {
        this.synthesis.resume();
      }
    } catch {
      // ignore
    }

    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;

    utterance.volume = Math.max(0.1, Math.min(1.0, desiredVolume));
    utterance.pitch = options.pitch ?? (options.voiceGender === 'female' ? 1.05 : 0.95);
    utterance.rate = options.rate ?? 1.02;

    const voices = this.getAvailableVoices();
    if (voices.length > 0) {
      // 1. Try to find requested voice name
      let selectedVoice = voices.find(v => 
        options.voiceName && v.name.toLowerCase().includes(options.voiceName.toLowerCase())
      );

      // 2. Try to match natural English voice by gender
      if (!selectedVoice) {
        const isFemale = options.voiceGender === 'female';
        selectedVoice = voices.find(v => 
          v.lang.startsWith('en') && 
          (isFemale 
            ? /female|samantha|zira|karen|victoria|natural|jenny|amy|ava|allison|fiona/i.test(v.name)
            : /male|david|george|daniel|guy|ryan|marcus|tom|oliver|arthur/i.test(v.name))
        ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    let didEnd = false;
    let safetyTimer: number | null = null;

    const safeEnd = () => {
      if (didEnd) return;
      didEnd = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      this.currentUtterance = null;
      options.onEnd?.();
    };

    // Calculate maximum expected duration with generous buffer
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const maxSpeechMs = Math.max(3000, Math.min(18000, wordCount * 500 + 2500));
    safetyTimer = window.setTimeout(() => {
      if (!didEnd && this.synthesis && !this.synthesis.speaking) {
        safeEnd();
      }
    }, maxSpeechMs);

    utterance.onstart = () => {
      options.onStart?.();

      // Chrome 15-second speech stall prevention watchdog
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = window.setInterval(() => {
        if (this.synthesis?.speaking) {
          try {
            this.synthesis.pause();
            this.synthesis.resume();
          } catch {
            // ignore
          }
        } else {
          if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
          }
        }
      }, 8000);
    };

    utterance.onend = () => {
      safeEnd();
    };

    utterance.onerror = (e) => {
      if (didEnd) return;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      this.currentUtterance = null;
      console.warn('Speech synthesis error event:', e);

      // Fall back to acoustic voice tone so user still hears audio
      this.stopAcousticFallback = playAcousticVoiceCadence(
        text,
        options.voiceGender || 'female',
        () => safeEnd()
      );
    };

    try {
      this.synthesis.speak(utterance);
      if (this.synthesis.paused) {
        this.synthesis.resume();
      }
    } catch (err) {
      console.warn('Speech synthesis speak invocation error, using acoustic fallback:', err);
      this.stopAcousticFallback = playAcousticVoiceCadence(
        text,
        options.voiceGender || 'female',
        () => options.onEnd?.()
      );
    }
  }

  public stopSpeaking() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.stopAcousticFallback) {
      this.stopAcousticFallback();
      this.stopAcousticFallback = null;
    }
    if (this.synthesis) {
      try {
        this.synthesis.cancel();
      } catch {
        // ignore
      }
      this.currentUtterance = null;
    }
  }

  public isSpeaking(): boolean {
    return !!(this.synthesis && this.synthesis.speaking);
  }
}

export const speechEngine = new SpeechEngine();
