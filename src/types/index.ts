export type AppView = 
  | 'home'
  | 'call'
  | 'live_connect'
  | 'dashboard'
  | 'history'
  | 'contacts'
  | 'voice'
  | 'campaigns'
  | 'schedule'
  | 'retry'
  | 'sms'
  | 'reports'
  | 'ivr'
  | 'audio'
  | 'sim'
  | 'upgrade'
  | 'permissions'
  | 'settings'
  | 'telephony';

export interface TrialBalance {
  minutesLeftSeconds: number; // e.g. 600 for 10:00
  callsRemaining: number; // 5
  totalCallsAllowed: number; // 5
  daysLeft: number; // 7
  planName?: string;
}

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface PlanDetails {
  id: PlanTier;
  name: string;
  badge?: string;
  priceMonthly: number;
  priceYearly: number;
  minutesIncluded: number;
  callsLimit: string;
  concurrentLines: number;
  dedicatedNumbers: number;
  popular?: boolean;
  features: string[];
  specs: {
    latency: string;
    concurrency: string;
    recordingStorage: string;
    support: string;
    webhooks: boolean;
    customVoiceClone: boolean;
  };
}

export interface UserSubscription {
  currentPlanId: PlanTier;
  billingCycle: 'monthly' | 'yearly';
  renewsAt: string;
  invoiceId: string;
  paymentMethod: {
    brand: string;
    last4: string;
    expiry: string;
  };
}

export interface AppContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  category?: string;
  lastCalled?: string;
}

export type NavigationTab = 
  | 'home' 
  | 'call' 
  | 'dashboard' 
  | 'contacts' 
  | 'settings'
  | 'simulator'
  | 'campaigns'
  | 'logs'
  | 'agents'
  | 'telephony';

export type CallStatus = 'idle' | 'dialing' | 'ringing' | 'connected' | 'hold' | 'transferred' | 'ended';

export type CallDisposition = 
  | 'Completed' 
  | 'Transferred' 
  | 'Voicemail' 
  | 'Busy' 
  | 'No Answer' 
  | 'Dropped';

export type Sentiment = 'positive' | 'neutral' | 'skeptical' | 'urgent' | 'negative';

export interface TranscriptMessage {
  id: string;
  sender: 'agent' | 'user' | 'system';
  text: string;
  timestamp: string;
  sentiment?: Sentiment;
  audioDuration?: number;
}

export interface VoiceAgent {
  id: string;
  name: string;
  role: string;
  avatarUrl: string;
  voiceName: string;
  voiceGender: 'female' | 'male';
  voiceAccent: string;
  pitch: number;
  rate: number;
  systemPrompt: string;
  firstMessage: string;
  knowledgeBase: string[];
  interruptionSensitivity: number; // 0 - 100
  silenceTimeoutMs: number;
  toolsEnabled: string[];
  category: 'sales' | 'support' | 'healthcare' | 'automotive' | 'finance' | 'custom';
}

export interface CallLog {
  id: string;
  callerName: string;
  callerNumber: string;
  agentId: string;
  agentName: string;
  direction: 'inbound' | 'outbound';
  durationSeconds: number;
  timestamp: string;
  disposition: CallDisposition;
  sentiment: Sentiment;
  cost: number;
  latencyMs: number;
  summary: string;
  keyEntities: Record<string, string>;
  transcript: TranscriptMessage[];
  audioUrl?: string;
  campaignId?: string;
}

export interface CampaignContact {
  id: string;
  name: string;
  phoneNumber: string;
  variables: Record<string, string>;
  status: 'pending' | 'calling' | 'connected' | 'completed' | 'failed' | 'voicemail';
  callDuration?: number;
  disposition?: CallDisposition;
}

export interface Campaign {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  totalContacts: number;
  calledCount: number;
  connectedCount: number;
  concurrencyLimit: number;
  createdAt: string;
  scriptSnippet: string;
  contacts: CampaignContact[];
}

export interface PhoneNumberItem {
  id: string;
  number: string;
  country: string;
  type: 'local' | 'toll-free' | 'mobile';
  assignedAgentId: string;
  monthlyCost: number;
  status: 'active' | 'configuring';
  recordCalls: boolean;
}
