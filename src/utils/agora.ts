/**
 * Agora RTC Voice Calling Service (Real Hardware Mic + Real Remote User Events)
 * Built with agora-rtc-sdk-ng for live multi-device original voice rooms.
 */

import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IRemoteAudioTrack,
  UID,
  ConnectionState
} from 'agora-rtc-sdk-ng';

export interface AgoraConfig {
  appId: string;
  channel: string;
  token?: string;
  uid?: UID;
}

export interface AgoraSessionStats {
  connectionState: ConnectionState;
  channelName: string;
  localUid: UID | null;
  remoteUsersCount: number;
  uplinkNetworkQuality: number;
  downlinkNetworkQuality: number;
  audioPacketsLost: number;
  roundTripTimeMs: number;
  audioLevel: number;
}

export const DEFAULT_AGORA_APP_ID = 'aab8b8f5a8cd4469a63042fcfafe7063';
export const DEFAULT_AGORA_CHANNEL = 'robovoice-live';

export class AgoraVoiceManager {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  public isPublishing: boolean = false;

  public appId: string = DEFAULT_AGORA_APP_ID;
  public channel: string = DEFAULT_AGORA_CHANNEL;
  public token: string = '';
  public currentUid: UID | null = null;
  public isConnected: boolean = false;
  public connectionState: ConnectionState = 'DISCONNECTED';
  public remoteUsers: Map<UID, { audioTrack?: IRemoteAudioTrack }> = new Map();

  private onStateChangeCallback?: (state: ConnectionState) => void;
  private onAudioLevelCallback?: (level: number) => void;
  private onNetworkQualityCallback?: (uplink: number, downlink: number) => void;
  private onRemoteUsersChangeCallback?: (count: number, uids: UID[]) => void;
  private onLogCallback?: (log: { time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }) => void;

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem('applet_agora_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.appId) this.appId = parsed.appId;
        if (parsed.channel) this.channel = parsed.channel;
        if (parsed.token) this.token = parsed.token;
      }
    } catch {}
  }

  public saveConfig(config: { appId: string; channel: string; token?: string }) {
    this.appId = config.appId.trim() || DEFAULT_AGORA_APP_ID;
    this.channel = config.channel.trim() || DEFAULT_AGORA_CHANNEL;
    this.token = config.token?.trim() || '';

    try {
      localStorage.setItem('applet_agora_config', JSON.stringify({
        appId: this.appId,
        channel: this.channel,
        token: this.token
      }));
    } catch {}

    this.log(`Agora config saved: App ID ${this.appId.substring(0, 6)}... Channel: ${this.channel}`, 'info');
  }

  public setCallbacks(options: {
    onStateChange?: (state: ConnectionState) => void;
    onAudioLevel?: (level: number) => void;
    onNetworkQuality?: (uplink: number, downlink: number) => void;
    onRemoteUsersChange?: (count: number, uids: UID[]) => void;
    onLog?: (log: { time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }) => void;
  }) {
    this.onStateChangeCallback = options.onStateChange;
    this.onAudioLevelCallback = options.onAudioLevel;
    this.onNetworkQualityCallback = options.onNetworkQuality;
    this.onRemoteUsersChangeCallback = options.onRemoteUsersChange;
    this.onLogCallback = options.onLog;
  }

  private log(text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.onLogCallback?.({ time, text, type });
  }

  public async joinVoiceChannel(customParams?: { channel?: string; uid?: UID }): Promise<UID> {
    const targetChannel = customParams?.channel || this.channel;
    const targetUid = customParams?.uid || Math.floor(100000 + Math.random() * 900000);

    this.log(`Joining Agora RTC channel "${targetChannel}"...`, 'info');

    try {
      // Request real microphone first so failed permissions fail fast cleanly
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'high_quality_stereo',
        AEC: true,
        ANS: true,
        AGC: true
      });
      this.localAudioTrack = micTrack;

      this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.setupClientEvents(this.client);

      const joinedUid = await this.client.join(
        this.appId,
        targetChannel,
        this.token ? this.token : null,
        targetUid
      );

      this.currentUid = joinedUid;
      this.isConnected = true;
      this.connectionState = 'CONNECTED';

      await this.client.publish([micTrack]);
      this.isPublishing = true;
      this.client.enableAudioVolumeIndicator();

      this.log(`✓ Joined Agora channel "${targetChannel}" (UID: ${joinedUid}) & publishing live mic audio.`, 'success');
      return joinedUid;
    } catch (err: any) {
      await this.leaveVoiceChannel();
      const msg = err?.message || String(err);
      this.log(`Agora call error: ${msg}`, 'error');
      throw new Error(msg);
    }
  }

  private setupClientEvents(client: IAgoraRTCClient) {
    client.on('user-published', async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
          this.remoteUsers.set(user.uid, { audioTrack: user.audioTrack });
          this.onRemoteUsersChangeCallback?.(this.remoteUsers.size, Array.from(this.remoteUsers.keys()));
          this.log(`✓ Remote participant ${user.uid} connected & audio playing.`, 'success');
        }
      } catch (e: any) {
        this.log(`Agora subscribe error: ${e?.message}`, 'error');
      }
    });

    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'audio') {
        this.remoteUsers.delete(user.uid);
        this.onRemoteUsersChangeCallback?.(this.remoteUsers.size, Array.from(this.remoteUsers.keys()));
      }
    });

    client.on('user-left', (user) => {
      this.remoteUsers.delete(user.uid);
      this.onRemoteUsersChangeCallback?.(this.remoteUsers.size, Array.from(this.remoteUsers.keys()));
      this.log(`Remote participant ${user.uid} left channel.`, 'info');
    });

    client.on('connection-state-change', (curState) => {
      this.connectionState = curState;
      this.onStateChangeCallback?.(curState);
    });

    client.on('network-quality', (stats) => {
      this.onNetworkQualityCallback?.(stats.uplinkNetworkQuality, stats.downlinkNetworkQuality);
    });

    client.on('volume-indicator', (volumes) => {
      if (volumes && volumes.length > 0) {
        const local = volumes.find((v) => v.uid === 0 || v.uid === this.currentUid);
        if (local) {
          this.onAudioLevelCallback?.(Math.min(100, Math.round(local.level)));
        }
      }
    });
  }

  public async setMute(muted: boolean) {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setEnabled(!muted);
      this.log(muted ? 'Agora microphone muted.' : 'Agora microphone unmuted.', 'info');
    }
  }

  public async leaveVoiceChannel() {
    try {
      if (this.localAudioTrack) {
        this.localAudioTrack.stop();
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }

      if (this.client) {
        await this.client.leave();
        this.client.removeAllListeners();
        this.client = null;
      }
    } catch {} finally {
      this.isConnected = false;
      this.connectionState = 'DISCONNECTED';
      this.currentUid = null;
      this.remoteUsers.clear();
      this.isPublishing = false;
      this.onRemoteUsersChangeCallback?.(0, []);
      this.onStateChangeCallback?.('DISCONNECTED');
    }
  }

  public getStats(): AgoraSessionStats {
    let rtt = 0;
    let lost = 0;

    if (this.client) {
      try {
        const rtcStats = this.client.getRTCStats();
        rtt = rtcStats.RTT || 0;
        lost = rtcStats.UserCount || 0;
      } catch {}
    }

    return {
      connectionState: this.connectionState,
      channelName: this.channel,
      localUid: this.currentUid,
      remoteUsersCount: this.remoteUsers.size,
      uplinkNetworkQuality: 1,
      downlinkNetworkQuality: 1,
      audioPacketsLost: lost,
      roundTripTimeMs: rtt,
      audioLevel: 0
    };
  }
}

export const agoraVoiceManager = new AgoraVoiceManager();
