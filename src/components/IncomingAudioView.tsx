import React, { useState, useRef, useEffect } from 'react';
import { 
  Volume2, ChevronLeft, Play, Pause, Music, Radio, Bell, Upload, 
  Mic, Square, Check, Trash2, Smartphone, FileAudio, Link2, Sparkles
} from 'lucide-react';
import { ringback, holdMusic, playConnectChime, unlockAudioAndSpeech } from '../utils/audio';

interface AudioTrack {
  id: string;
  name: string;
  category: 'greeting' | 'hold' | 'ivr' | 'voicemail';
  format: string;
  sizeMb: string;
  duration: string;
  url?: string;
  isUserUploaded?: boolean;
}

const DEFAULT_TRACKS: AudioTrack[] = [
  {
    id: 'track-default-hold',
    name: 'Corporate Smooth Jazz Hold Track',
    category: 'hold',
    format: 'MP3 (192kbps)',
    sizeMb: '1.8 MB',
    duration: '01:45',
    isUserUploaded: false
  },
  {
    id: 'track-default-greeting',
    name: 'Professional Business Introduction Greeting',
    category: 'greeting',
    format: 'WAV (44.1kHz)',
    sizeMb: '2.4 MB',
    duration: '00:18',
    isUserUploaded: false
  },
  {
    id: 'track-default-ivr',
    name: 'Main Company IVR Reception Prompt',
    category: 'ivr',
    format: 'MP3 (128kbps)',
    sizeMb: '0.9 MB',
    duration: '00:24',
    isUserUploaded: false
  }
];

interface IncomingAudioViewProps {
  onBack: () => void;
}

export const IncomingAudioView: React.FC<IncomingAudioViewProps> = ({ onBack }) => {
  // Tone generator state
  const [playingTone, setPlayingTone] = useState<string | null>(null);

  // Audio tracks state
  const [tracks, setTracks] = useState<AudioTrack[]>(() => {
    try {
      const saved = localStorage.getItem('applet_audio_tracks');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return DEFAULT_TRACKS;
  });

  const [activePlayingTrackId, setActivePlayingTrackId] = useState<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Upload state
  const [uploadCategory, setUploadCategory] = useState<'greeting' | 'hold' | 'ivr' | 'voicemail'>('greeting');
  const [uploadSuccessToast, setUploadSuccessToast] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Microphone recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingSecondsRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Save tracks to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('applet_audio_tracks', JSON.stringify(tracks));
    } catch {
      // ignore
    }
  }, [tracks]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      ringback.stop();
      holdMusic.stop();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // Robust Mobile Audio File Processor
  const processAudioFile = (file: File) => {
    if (!file) return;
    setIsProcessingFile(true);

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    const extension = file.name.split('.').pop()?.toUpperCase() || 'MP3';
    const cleanName = file.name.replace(/\.[^/.]+$/, '') || 'Custom Phone Audio';

    // Use FileReader for persistent Base64 Data URL (immune to iframe / blob revocation)
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;

      const newTrack: AudioTrack = {
        id: `custom-audio-${Date.now()}`,
        name: cleanName,
        category: uploadCategory,
        format: extension,
        sizeMb: sizeMb,
        duration: '00:30',
        url: dataUrl,
        isUserUploaded: true
      };

      setTracks(prev => [newTrack, ...prev]);
      setIsProcessingFile(false);
      setUploadSuccessToast(`"${cleanName}" uploaded and saved as ${uploadCategory.toUpperCase()} audio!`);
      setTimeout(() => setUploadSuccessToast(null), 3500);
    };

    reader.onerror = () => {
      // Fallback to object URL if FileReader fails
      const objectUrl = URL.createObjectURL(file);
      const newTrack: AudioTrack = {
        id: `custom-audio-${Date.now()}`,
        name: cleanName,
        category: uploadCategory,
        format: extension,
        sizeMb: sizeMb,
        duration: '00:30',
        url: objectUrl,
        isUserUploaded: true
      };
      setTracks(prev => [newTrack, ...prev]);
      setIsProcessingFile(false);
      setUploadSuccessToast(`"${cleanName}" uploaded!`);
      setTimeout(() => setUploadSuccessToast(null), 3500);
    };

    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processAudioFile(e.target.files[0]);
    }
  };

  // Add Audio via URL
  const handleAddFromUrl = () => {
    if (!urlInput.trim()) return;
    const cleanUrl = urlInput.trim();
    const fileName = cleanUrl.split('/').pop()?.split('?')[0] || 'Web Audio Track';

    const newTrack: AudioTrack = {
      id: `url-audio-${Date.now()}`,
      name: fileName,
      category: uploadCategory,
      format: 'STREAM',
      sizeMb: 'Cloud File',
      duration: '00:30',
      url: cleanUrl,
      isUserUploaded: true
    };

    setTracks(prev => [newTrack, ...prev]);
    setUrlInput('');
    setUploadSuccessToast(`"${fileName}" added successfully!`);
    setTimeout(() => setUploadSuccessToast(null), 3500);
  };

  // Live microphone recording
  const startRecording = async () => {
    unlockAudioAndSpeech();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const durationSecs = Math.max(1, recordingSecondsRef.current);
        const mins = Math.floor(durationSecs / 60);
        const secs = durationSecs % 60;
        const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          const newTrack: AudioTrack = {
            id: `voice-rec-${Date.now()}`,
            name: `Phone Voice Note (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
            category: uploadCategory,
            format: 'VOICE (Mic)',
            sizeMb: (audioBlob.size / 1024).toFixed(0) + ' KB',
            duration: durStr,
            url: base64Audio,
            isUserUploaded: true
          };

          setTracks(prev => [newTrack, ...prev]);
          setUploadSuccessToast(`Voice greeting (${durStr}) recorded and saved!`);
          setTimeout(() => setUploadSuccessToast(null), 3000);
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone error in IncomingAudioView:', err);
      setUploadSuccessToast('Microphone access blocked. Please allow microphone in browser permissions.');
      setTimeout(() => setUploadSuccessToast(null), 4000);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Play uploaded audio track
  const togglePlayTrack = (track: AudioTrack) => {
    unlockAudioAndSpeech();

    if (activePlayingTrackId === track.id) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      setActivePlayingTrackId(null);
      return;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    if (track.url) {
      const audio = new Audio(track.url);
      audioElementRef.current = audio;
      audio.play().catch(() => {
        // Fallback chime
        playConnectChime();
      });
      setActivePlayingTrackId(track.id);
      audio.onended = () => setActivePlayingTrackId(null);
      audio.onerror = () => setActivePlayingTrackId(null);
    } else {
      playConnectChime();
      setActivePlayingTrackId(track.id);
      setTimeout(() => setActivePlayingTrackId(null), 2000);
    }
  };

  // Delete track
  const handleDeleteTrack = (id: string) => {
    if (activePlayingTrackId === id && audioElementRef.current) {
      audioElementRef.current.pause();
      setActivePlayingTrackId(null);
    }
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  // Procedural tones
  const handleToggleTone = (type: string) => {
    unlockAudioAndSpeech();
    if (playingTone === type) {
      if (type === 'ringback') ringback.stop();
      if (type === 'hold') holdMusic.stop();
      setPlayingTone(null);
      return;
    }

    ringback.stop();
    holdMusic.stop();

    if (type === 'ringback') {
      ringback.start();
      setPlayingTone('ringback');
    } else if (type === 'hold') {
      holdMusic.start();
      setPlayingTone('hold');
    } else if (type === 'chime') {
      playConnectChime();
      setPlayingTone('chime');
      setTimeout(() => setPlayingTone(null), 1000);
    }
  };

  return (
    <div className="w-full flex flex-col gap-5 pb-10">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            ringback.stop();
            holdMusic.stop();
            if (audioElementRef.current) audioElementRef.current.pause();
            onBack();
          }}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-sky-600" />
          <span>Audio Upload & Voicemail Studio</span>
        </h2>

        <div className="w-12" />
      </div>

      {/* SIM Airtime Priority & Billing Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-xl p-4 shadow-md text-white flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 font-bold">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-300">
                1st Priority: SIM Card Cellular Airtime Mode
              </h4>
              <span className="text-[11px] text-slate-300">
                You can route calls directly through your phone's physical SIM card and carrier airtime.
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold text-[10px] uppercase shrink-0">
            Active Priority
          </span>
        </div>
        <p className="text-xs text-slate-300 border-t border-slate-800 pt-2 leading-relaxed">
          • <strong>In-App SIM Airtime Profile</strong>: Routed strictly inside RoboVoiceCall using your configured cellular SIM trunk profile.<br />
          • <strong>In-App WebRTC Calls</strong>: Carried out 100% inside the app via WebRTC data (Wi-Fi or Mobile Data) with zero external app handoffs.
        </p>
      </div>

      {/* Toast Notification */}
      {uploadSuccessToast && (
        <div className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-md flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4" />
          <span>{uploadSuccessToast}</span>
        </div>
      )}

      {/* SECTION 1: Mobile-Optimized Phone Audio Uploader */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-600" />
            <span>Upload MP3 / Audio from Your Phone</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Select any MP3, WAV, or M4A audio file directly from your phone's files, voice memos, or downloads.
          </p>
        </div>

        {/* Category selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Assign To:</span>
          {(['greeting', 'hold', 'ivr', 'voicemail'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setUploadCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                uploadCategory === cat
                  ? 'bg-sky-600 text-white font-bold shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat === 'ivr' ? 'IVR Menu Prompt' : cat === 'hold' ? 'Hold Music' : cat === 'greeting' ? 'Agent Greeting' : 'Voicemail Drop'}
            </button>
          ))}
        </div>

        {/* Mobile Phone File Picker Button (Guaranteed to open phone file picker) */}
        <div className="flex flex-col gap-2.5">
          <input
            id="mobile-phone-audio-input"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,*/*"
            onChange={handleFileInput}
            className="hidden"
          />

          <label
            htmlFor="mobile-phone-audio-input"
            className="w-full flex items-center justify-center gap-2.5 py-4 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-sm shadow-md cursor-pointer active:scale-[0.99] transition text-center"
          >
            <FileAudio className="w-5 h-5" />
            <span>{isProcessingFile ? 'Loading Audio File...' : '📱 Select MP3 / Audio from Phone'}</span>
          </label>

          <span className="text-[11px] text-center text-slate-500">
            Tap above to pick MP3, WAV, M4A, or Voice Memo files from your device storage or iCloud/Google Drive
          </span>
        </div>

        {/* Alternative 1: Paste Direct Audio Link */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Or paste direct MP3 audio URL (https://...)"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-sky-500"
            />
          </div>
          <button
            onClick={handleAddFromUrl}
            disabled={!urlInput.trim()}
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-semibold text-xs transition"
          >
            Add URL
          </button>
        </div>

        {/* Alternative 2: Live Mic Recorder */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 text-slate-700'
            }`}>
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800 block">
                {isRecording ? `Recording... (${recordingSeconds}s)` : 'Record with Phone Microphone'}
              </span>
              <span className="text-[11px] text-slate-500">
                Speak directly into your phone to record a custom greeting right now.
              </span>
            </div>
          </div>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 ${
              isRecording 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {isRecording ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{isRecording ? 'Stop & Save' : 'Record'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 2: Active Audio Library */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Your Audio Library ({tracks.length})</h3>
            <p className="text-xs text-slate-500">
              Audio tracks ready for outbound calling, hold queues, and IVR routing.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {tracks.map((track) => {
            const isPlaying = activePlayingTrackId === track.id;
            return (
              <div
                key={track.id}
                className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                  isPlaying 
                    ? 'border-sky-500 bg-sky-50/50 shadow-sm' 
                    : 'border-slate-200 bg-slate-50/80 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => togglePlayTrack(track)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition shrink-0 ${
                      isPlaying 
                        ? 'bg-sky-600 text-white animate-pulse' 
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-sky-50 hover:text-sky-600'
                    }`}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{track.name}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                        {track.category}
                      </span>
                      {track.isUserUploaded && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Your Upload
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{track.format}</span>
                      <span>•</span>
                      <span>{track.sizeMb}</span>
                      <span>•</span>
                      <span>{track.duration}</span>
                    </div>
                  </div>
                </div>

                {track.isUserUploaded && (
                  <button
                    onClick={() => handleDeleteTrack(track.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                    title="Remove audio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: Telephony Synthesizer Cues */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Default Telephony Audio Cues</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Procedurally synthesized telecom audio tones and waiting tracks powered by Web Audio API.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Tone 1 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">North American Ringback (440Hz + 480Hz)</span>
                <span className="text-[11px] text-slate-500">Standard telecommunications ring sequence</span>
              </div>
            </div>
            <button
              onClick={() => handleToggleTone('ringback')}
              className={`p-2 rounded-lg transition ${playingTone === 'ringback' ? 'bg-amber-600 text-white animate-pulse' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
            >
              {playingTone === 'ringback' ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
          </div>

          {/* Tone 2 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Corporate Hold Music Synthesizer</span>
                <span className="text-[11px] text-slate-500">Procedural ambient pentatonic chord progression</span>
              </div>
            </div>
            <button
              onClick={() => handleToggleTone('hold')}
              className={`p-2 rounded-lg transition ${playingTone === 'hold' ? 'bg-amber-600 text-white animate-pulse' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
            >
              {playingTone === 'hold' ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
          </div>

          {/* Tone 3 */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Agent Connect Chime (Tri-Tone C5-E5-G5)</span>
                <span className="text-[11px] text-slate-500">Audio cue played at moment caller connects</span>
              </div>
            </div>
            <button
              onClick={() => handleToggleTone('chime')}
              className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
