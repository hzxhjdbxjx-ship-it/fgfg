import { VoiceAgent, CallLog, Campaign, PhoneNumberItem } from '../types';

export const INITIAL_AGENTS: VoiceAgent[] = [
  {
    id: 'agent-ava',
    name: 'Ava Bennett',
    role: 'Customer Success & Tier-1 Support Specialist',
    avatarUrl: '/src/assets/images/avatar_voice_ava_1790137650253.jpg',
    voiceName: 'Samantha / Jenny Natural',
    voiceGender: 'female',
    voiceAccent: 'US Standard Neutral',
    pitch: 1.05,
    rate: 1.02,
    systemPrompt: `You are Ava, an empathetic and highly knowledgeable Tier-1 Support Voice Specialist for RoboVoiceCall Cloud. Your mission is to assist customers with account logins, billing inquiries, feature explanations, and service outages.
- Maintain a warm, clear, and reassuring tone.
- Keep answers under 2-3 sentences to keep phone conversations snappy.
- If a customer asks to speak to a human or has a complex billing dispute, offer to transfer them directly to our Tier-2 engineering desk.`,
    firstMessage: "Hi there! Thanks for calling RoboVoice support. My name is Ava. How can I assist you with your workspace today?",
    knowledgeBase: [
      "Password resets can be triggered directly in Settings > Security or via emailed magic link.",
      "Inbound phone numbers cost $2.00/month plus $0.015 per connected minute.",
      "Current platform uptime is 99.98% across all telephony hubs.",
      "Webhook payloads support HMAC SHA-256 signature verification."
    ],
    interruptionSensitivity: 85,
    silenceTimeoutMs: 1400,
    toolsEnabled: ['check_ticket_status', 'reset_auth_token', 'transfer_to_human'],
    category: 'support'
  },
  {
    id: 'agent-marcus',
    name: 'Marcus Vance',
    role: 'Outbound B2B Lead Qualifier & Sales SDR',
    avatarUrl: '/src/assets/images/avatar_voice_marcus_1790137664045.jpg',
    voiceName: 'David / Ryan Natural',
    voiceGender: 'male',
    voiceAccent: 'US Executive Mid-Atlantic',
    pitch: 0.98,
    rate: 1.04,
    systemPrompt: `You are Marcus, a sharp, persuasive outbound B2B Sales Development Representative for RoboVoiceCall. You are calling decision-makers who downloaded our Whitepaper on Telephony Automation.
- Goal: Qualify team size (sales reps), current phone stack (RingCentral, Genesys), and schedule a 15-minute tailored demo with an Enterprise Solutions Architect.
- Handle objections respectfully: If they say "send an email", ask what email address and offer a quick 30-second summary.`,
    firstMessage: "Hey there, this is Marcus with RoboVoiceCall! I noticed your team was reviewing our telephony automation overview. Did I catch you with thirty seconds?",
    knowledgeBase: [
      "RoboVoiceCall saves an average of $38,000 annually per 10-person SDR team.",
      "Our AI agents achieve an 84% live answer pickup rate and 340ms average response latency.",
      "Native integrations available for Salesforce, HubSpot, and Slack."
    ],
    interruptionSensitivity: 90,
    silenceTimeoutMs: 1200,
    toolsEnabled: ['check_calendar_slot', 'book_demo_meeting', 'send_sms_link'],
    category: 'sales'
  },
  {
    id: 'agent-elena',
    name: 'Elena Rostova',
    role: 'Healthcare Patient Intake & Appointment Coordinator',
    avatarUrl: '/src/assets/images/avatar_voice_elena_1790137676521.jpg',
    voiceName: 'Victoria / Amy Natural',
    voiceGender: 'female',
    voiceAccent: 'US Calm Professional',
    pitch: 1.0,
    rate: 0.98,
    systemPrompt: `You are Elena, a calm and HIPAA-compliant appointment coordinator for MetroCare Health Clinic.
- Confirm patient identity using Date of Birth and Full Name.
- Coordinate appointment bookings, follow-up reminders, and post-visit surveys.
- Never diagnose symptoms. In case of emergency, instruct caller to hang up and call 911 immediately.`,
    firstMessage: "Hello, this is Elena calling from MetroCare Health Clinic regarding your upcoming preventative wellness checkup. Am I speaking with the patient?",
    knowledgeBase: [
      "Clinic hours are Monday through Friday 8:00 AM to 5:30 PM, Saturday 9:00 AM to 1:00 PM.",
      "Co-pays can be handled at check-in or via the patient portal.",
      "Fasting is required 8 hours prior for comprehensive metabolic blood panels."
    ],
    interruptionSensitivity: 80,
    silenceTimeoutMs: 1600,
    toolsEnabled: ['verify_patient_dob', 'reschedule_appointment', 'send_calendar_invite'],
    category: 'healthcare'
  },
  {
    id: 'agent-carlos',
    name: 'Carlos Mendez',
    role: 'Automotive Dealership Service Advisor',
    avatarUrl: '/src/assets/images/avatar_voice_carlos_1790137688394.jpg',
    voiceName: 'George / Daniel Natural',
    voiceGender: 'male',
    voiceAccent: 'US Friendly Regional',
    pitch: 0.96,
    rate: 1.0,
    systemPrompt: `You are Carlos, a trusted service advisor at Apex Motors. You assist customers in scheduling manufacturer safety recalls, brake inspections, seasonal tire swaps, and oil changes.
- Inquire about vehicle mileage and preferred drop-off day.
- Mention complimentary shuttle or loaner vehicle options.`,
    firstMessage: "Hi there! Carlos here with Apex Motors Service Department. I'm following up on the routine 15,000-mile maintenance check for your vehicle. How has everything been running?",
    knowledgeBase: [
      "Complimentary multi-point inspection included with all scheduled appointments.",
      "Express service lane takes 45 minutes or less for synthetic oil and filter change.",
      "Complimentary ride-share vouchers available for repairs over 2 hours."
    ],
    interruptionSensitivity: 80,
    silenceTimeoutMs: 1500,
    toolsEnabled: ['query_vin_records', 'schedule_service_bay', 'reserve_loaner_vehicle'],
    category: 'automotive'
  },
  {
    id: 'agent-serena',
    name: 'Serena Croft',
    role: 'Banking Security & Fraud Detection Robo-Bot',
    avatarUrl: '/src/assets/images/avatar_voice_elena_1790137676521.jpg',
    voiceName: 'Zira / Karen Professional',
    voiceGender: 'female',
    voiceAccent: 'US Crisp Telecom',
    pitch: 1.02,
    rate: 1.05,
    systemPrompt: `You are Serena, an automated security agent calling from Meridian Bank Fraud Prevention Services.
- Alert customer to a flagged transaction: $482.90 at an electronics retail website.
- Request verification: "Press 1 or say Yes if you authorized this charge. Press 2 or say No if you did not."
- If unauthorized, immediately temporarily freeze card and initiate human specialist transfer.`,
    firstMessage: "This is Meridian Bank Automated Fraud Security. We have detected unusual activity on your card ending in 4108. Did you authorize a transaction for four hundred eighty-two dollars?",
    knowledgeBase: [
      "Meridian Bank never asks for your full PIN or online banking password over the phone.",
      "Blocked cards can be re-issued instantly to Apple Wallet / Google Pay.",
      "Zero liability guarantee covers verified fraudulent transactions."
    ],
    interruptionSensitivity: 95,
    silenceTimeoutMs: 1300,
    toolsEnabled: ['verify_transaction_auth', 'lock_debit_card', 'escalate_fraud_case'],
    category: 'finance'
  },
  {
    id: 'agent-david',
    name: 'David Cole',
    role: 'Accounts Receivable & Payment Arrangements Assistant',
    avatarUrl: '/src/assets/images/avatar_voice_carlos_1790137688394.jpg',
    voiceName: 'Guy / Alex Natural',
    voiceGender: 'male',
    voiceAccent: 'US Calm Direct',
    pitch: 0.94,
    rate: 1.0,
    systemPrompt: `You are David, a courteous accounts specialist for National Utility Services. You contact customers with past-due balances.
- Objective: Secure payment or set up a split payment agreement across two pay periods.
- Provide balance details ($164.20) and payment link via instant SMS.`,
    firstMessage: "Hello, this is David calling from Apex Utility Services regarding statement balance notice for account ending in 7091. Do you have a quick moment to confirm receipt?",
    knowledgeBase: [
      "Payment extensions can be granted for up to 14 days without late fee penalty.",
      "Assistance programs available for eligible residential households.",
      "Card payments processed through 256-bit encrypted secure IVR portal."
    ],
    interruptionSensitivity: 80,
    silenceTimeoutMs: 1500,
    toolsEnabled: ['check_outstanding_balance', 'setup_payment_plan', 'send_payment_link'],
    category: 'finance'
  }
];

export const INITIAL_CALL_LOGS: CallLog[] = [];

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp-q4-renewals',
    name: 'Q4 Enterprise Service Renewals',
    agentId: 'agent-marcus',
    agentName: 'Marcus Vance',
    status: 'running',
    totalContacts: 120,
    calledCount: 78,
    connectedCount: 64,
    concurrencyLimit: 8,
    createdAt: '2026-09-28 09:30:00',
    scriptSnippet: 'Hi {{first_name}}, this is Marcus calling regarding your enterprise license at {{company}}...',
    contacts: [
      { id: 'nc-1', name: 'Alexander Hamilton', phoneNumber: '+1 (212) 555-1776', variables: { first_name: 'Alexander', company: 'Treasury Partners' }, status: 'connected' },
      { id: 'nc-2', name: 'Eleanor Roosevelt', phoneNumber: '+1 (202) 555-1933', variables: { first_name: 'Eleanor', company: 'Global Affairs Inc' }, status: 'connected' },
      { id: 'nc-3', name: 'Benjamin Franklin', phoneNumber: '+1 (215) 555-1752', variables: { first_name: 'Benjamin', company: 'Electric Ventures' }, status: 'pending' },
      { id: 'nc-4', name: 'Ada Lovelace', phoneNumber: '+1 (415) 555-1815', variables: { first_name: 'Ada', company: 'Analytical Engines' }, status: 'pending' },
    ]
  },
  {
    id: 'camp-patient-intake',
    name: 'Healthcare Appointment Confirmations',
    agentId: 'agent-elena',
    agentName: 'Elena Rostova',
    status: 'paused',
    totalContacts: 85,
    calledCount: 42,
    connectedCount: 38,
    concurrencyLimit: 4,
    createdAt: '2026-09-29 11:15:00',
    scriptSnippet: 'Hello {{first_name}}, this is Elena with RoboVoice Health calling to confirm your upcoming wellness appointment...',
    contacts: [
      { id: 'hc-1', name: 'Sarah Connor', phoneNumber: '+1 (310) 555-1984', variables: { first_name: 'Sarah', company: 'Cyberdyne Systems' }, status: 'completed' },
      { id: 'hc-2', name: 'Thomas Anderson', phoneNumber: '+1 (415) 555-1999', variables: { first_name: 'Thomas', company: 'Metacortex' }, status: 'pending' },
    ]
  }
];

export const INITIAL_PHONE_NUMBERS: PhoneNumberItem[] = [
  {
    id: 'phone-did-2',
    number: '+1 (415) 555-8920',
    country: 'United States',
    type: 'local',
    assignedAgentId: 'agent-marcus',
    monthlyCost: 0,
    status: 'active',
    recordCalls: true
  },
  {
    id: 'phone-did-3',
    number: '+91 (11) 4555-0199',
    country: 'India',
    type: 'local',
    assignedAgentId: 'agent-ava',
    monthlyCost: 0,
    status: 'active',
    recordCalls: true
  }
];

/**
 * Intelligent conversation generator based on agent persona and user speech
 */
export function generateAgentResponse(
  agent: VoiceAgent, 
  userText: string, 
  history: { sender: string; text: string }[]
): { reply: string; sentiment: 'positive' | 'neutral' | 'skeptical' | 'urgent'; toolExecuted?: string } {
  const lower = userText.toLowerCase().trim();

  // Agent Ava (Customer Support)
  if (agent.id === 'agent-ava') {
    if (lower.includes('human') || lower.includes('operator') || lower.includes('representative') || lower.includes('person') || lower.includes('manager')) {
      return {
        reply: "I completely understand! I can transfer you to our live engineering escalation desk right away. Please hold on for just a moment while I patch you through.",
        sentiment: 'neutral',
        toolExecuted: 'transfer_to_human'
      };
    }
    if (lower.includes('price') || lower.includes('cost') || lower.includes('billing') || lower.includes('charge')) {
      return {
        reply: "Our transparent pricing is straightforward: virtual phone lines are two dollars per month, and automated AI voice minutes are fifteen cents each with no hidden connection fees. You can view full usage in your billing tab.",
        sentiment: 'positive'
      };
    }
    if (lower.includes('password') || lower.includes('reset') || lower.includes('login') || lower.includes('locked')) {
      return {
        reply: "I can help you unlock your account right now! I have generated a secure one-time verification link and sent it to your registered account email.",
        sentiment: 'positive',
        toolExecuted: 'reset_auth_token'
      };
    }
    if (lower.includes('api') || lower.includes('webhook') || lower.includes('latency') || lower.includes('sdk')) {
      return {
        reply: "RoboVoiceCall supports REST and WebSocket streaming APIs with sub-400 millisecond response times. Our webhooks deliver real-time transcripts, sentiment scores, and audio recording URLs upon call termination.",
        sentiment: 'positive'
      };
    }
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return {
        reply: "Hello! It is great to speak with you. What can I help you configure or troubleshoot on your RoboVoice workspace?",
        sentiment: 'positive'
      };
    }
    return {
      reply: `Thanks for letting me know. Regarding "${userText.slice(0, 35)}...", our system can handle that directly through automated workflows or forward the request to your team. Would you like me to log a priority support ticket for you?`,
      sentiment: 'positive'
    };
  }

  // Agent Marcus (Sales SDR)
  if (agent.id === 'agent-marcus') {
    if (lower.includes('yes') || lower.includes('sure') || lower.includes('interested') || lower.includes('schedule') || lower.includes('demo') || lower.includes('book')) {
      return {
        reply: "Fantastic! I have open slots this Thursday at 2:00 PM Eastern or Friday at 11:00 AM Eastern. Which of those works better for a quick 15-minute screen share?",
        sentiment: 'positive',
        toolExecuted: 'check_calendar_slot'
      };
    }
    if (lower.includes('thursday') || lower.includes('friday') || lower.includes('morning') || lower.includes('afternoon') || lower.includes('tomorrow')) {
      return {
        reply: "Locked in! I have reserved that time on our Solutions Architect's calendar. I'm texting you the calendar confirmation link and Zoom room right now.",
        sentiment: 'positive',
        toolExecuted: 'book_demo_meeting'
      };
    }
    if (lower.includes('busy') || lower.includes('later') || lower.includes('not interested') || lower.includes('no')) {
      return {
        reply: "No worries at all! I appreciate your directness. May I send a 60-second summary video and case study over email so you have it on file when timing is right?",
        sentiment: 'neutral'
      };
    }
    if (lower.includes('pricing') || lower.includes('cost') || lower.includes('expensive')) {
      return {
        reply: "Most teams see an immediate 70% reduction in outbound customer acquisition cost compared to human dialers. We offer flexible usage tiers starting at forty-nine dollars a month with custom volume discounts.",
        sentiment: 'positive'
      };
    }
    return {
      reply: "That is a great question. We built RoboVoiceCall specifically to solve high latency and awkward pauses that plague older voice bots. Are you currently doing outbound prospecting or inbound routing?",
      sentiment: 'positive'
    };
  }

  // Agent Elena (Healthcare Clinic)
  if (agent.id === 'agent-elena') {
    if (lower.includes('yes') || lower.includes('confirm') || lower.includes('works') || lower.includes('keep')) {
      return {
        reply: "Wonderful, your appointment is confirmed! Remember to bring your photo ID and insurance card, and please arrive 10 minutes early. Is there anything else you need assistance with?",
        sentiment: 'positive',
        toolExecuted: 'reschedule_appointment'
      };
    }
    if (lower.includes('reschedule') || lower.includes('cancel') || lower.includes('change') || lower.includes('busy')) {
      return {
        reply: "Certainly, we can easily find another date. We have openings next Tuesday at 10:00 AM or Thursday at 3:30 PM. Would either of those fit your schedule?",
        sentiment: 'neutral'
      };
    }
    if (lower.includes('fasting') || lower.includes('food') || lower.includes('eat') || lower.includes('water')) {
      return {
        reply: "For comprehensive lab panels, please fast from food for 8 hours prior to your visit. Drinking plain water and taking prescribed morning medications is encouraged!",
        sentiment: 'positive'
      };
    }
    return {
      reply: "Thank you for letting me know. I have updated our clinic intake records. We will send a brief SMS reminder 24 hours prior to your visit!",
      sentiment: 'positive'
    };
  }

  // Agent Carlos (Automotive)
  if (agent.id === 'agent-carlos') {
    if (lower.includes('oil') || lower.includes('brakes') || lower.includes('service') || lower.includes('tire')) {
      return {
        reply: "We can take care of that for you! Our certified technicians run a complimentary 27-point inspection with every service. Can we book you for tomorrow at 8:30 AM or 1:00 PM?",
        sentiment: 'positive',
        toolExecuted: 'schedule_service_bay'
      };
    }
    if (lower.includes('loaner') || lower.includes('car') || lower.includes('shuttle') || lower.includes('ride')) {
      return {
        reply: "Yes, we offer complimentary local shuttle rides departing every 20 minutes, or loaner vehicles for appointments scheduled over two hours in advance.",
        sentiment: 'positive',
        toolExecuted: 'reserve_loaner_vehicle'
      };
    }
    return {
      reply: "Sounds great! I'll put you down on the technician board. You'll receive a text confirmation with directions to our express service lane.",
      sentiment: 'positive'
    };
  }

  // Agent Serena (Banking Fraud)
  if (agent.id === 'agent-serena') {
    if (lower.includes('no') || lower.includes('not me') || lower.includes('fraud') || lower.includes('did not')) {
      return {
        reply: "Understood. I have placed an immediate protective freeze on your card ending in 4108 so no further authorizations can process. I am transferring you now to our 24/7 Fraud Investigation Unit.",
        sentiment: 'urgent',
        toolExecuted: 'lock_debit_card'
      };
    }
    if (lower.includes('yes') || lower.includes('authorized') || lower.includes('i bought') || lower.includes('mine')) {
      return {
        reply: "Thank you for confirming! We have verified the transaction as legitimate and removed the temporary security flag from your account. Your card is ready for normal use.",
        sentiment: 'positive',
        toolExecuted: 'verify_transaction_auth'
      };
    }
    return {
      reply: "To protect your financial security, please confirm: did you authorize the charge of four hundred eighty-two dollars and ninety cents? You can press 1 for Yes or 2 for No.",
      sentiment: 'neutral'
    };
  }

  // Generic fallback
  return {
    reply: `I understand what you're saying about ${userText.slice(0, 30)}. Let me update our active call notes and ensure we take care of that for you right away. What else would you like to review?`,
    sentiment: 'positive'
  };
}

