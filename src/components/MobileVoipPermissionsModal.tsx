import React, { useState, useEffect } from 'react';
import { Phone, Users, Mic, Bell, X, Check, ShieldCheck, Smartphone } from 'lucide-react';
import { unlockAudioAndSpeech, getAudioContext } from '../utils/audio';

export interface MobileVoipPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAllGranted?: () => void;
}

export type PermissionStep = 'idle' | 'phone' | 'contacts' | 'audio' | 'notifications' | 'completed';

export const MobileVoipPermissionsModal: React.FC<MobileVoipPermissionsModalProps> = ({
  isOpen,
  onClose,
  onAllGranted
}) => {
  const [activeStep, setActiveStep] = useState<PermissionStep>('idle');
  const [permissionsState, setPermissionsState] = useState<{
    phone: boolean;
    contacts: boolean;
    audio: boolean;
    notifications: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem('mobilevoip_permissions');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { phone: true, contacts: true, audio: true, notifications: true };
  });

  // Save permissions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mobilevoip_permissions', JSON.stringify(permissionsState));
    } catch {}
  }, [permissionsState]);

  if (!isOpen) return null;

  // Start sequential permission sequence when user taps "GIVE ACCESS"
  const handleStartPermissionFlow = () => {
    unlockAudioAndSpeech();
    setActiveStep('phone');
  };

  const handlePhoneResponse = (granted: boolean) => {
    setPermissionsState(prev => ({ ...prev, phone: granted }));
    setActiveStep('contacts');
  };

  const handleContactsResponse = (granted: boolean) => {
    setPermissionsState(prev => ({ ...prev, contacts: granted }));
    setActiveStep('audio');
  };

  const handleAudioResponse = async (granted: boolean) => {
    if (granted) {
      unlockAudioAndSpeech();
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
          if (stream) {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
            // Stop tracks after checking
            stream.getTracks().forEach(t => t.stop());
          }
        }
      } catch (e) {
        console.warn('Audio permission note:', e);
      }
    }
    setPermissionsState(prev => ({ ...prev, audio: granted }));
    setActiveStep('notifications');
  };

  const handleNotificationResponse = async (granted: boolean) => {
    if (granted && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        await Notification.requestPermission().catch(() => {});
      } catch {}
    }
    setPermissionsState(prev => ({ ...prev, notifications: granted }));
    setActiveStep('completed');
    setTimeout(() => {
      setActiveStep('idle');
      onAllGranted?.();
      onClose();
    }, 900);
  };

  const allGranted = permissionsState.phone && permissionsState.contacts && permissionsState.audio && permissionsState.notifications;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fadeIn">
      {/* Container styled matching the authentic Android MobileVOIP screen in user's screenshots */}
      <div className="w-full max-w-sm sm:max-w-md bg-[#18191D] rounded-2xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden text-slate-100 relative min-h-[560px]">
        
        {/* Android Top Status Bar */}
        <div className="bg-[#0D4E8B] text-sky-200 px-4 pt-2 pb-1 text-[11px] font-mono flex items-center justify-between border-b border-sky-900/60 select-none">
          <span className="font-semibold text-white">MobileVOIP</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-sky-200 font-bold">Vo 5G</span>
            <div className="flex items-end gap-0.5 h-3">
              <span className="w-0.5 h-1 bg-white"></span>
              <span className="w-0.5 h-1.5 bg-white"></span>
              <span className="w-0.5 h-2 bg-white"></span>
              <span className="w-0.5 h-2.5 bg-white"></span>
            </div>
            <span className="text-[10px] text-sky-200 font-bold">60%</span>
          </div>
        </div>

        {/* Deep Blue Header Banner: "Permissions" */}
        <div className="bg-[#0066CC] px-5 py-3.5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-white" />
            <h2 className="text-xl font-bold text-white tracking-wide">Permissions</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content: 4 Permissions with exact text from screenshots */}
        <div className="p-5 flex-1 flex flex-col justify-between gap-5 bg-[#18191D]">
          <div className="flex flex-col gap-6">
            
            {/* Item 1: Phone Status & Calling */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                <Phone className="w-7 h-7 stroke-[1.8]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-relaxed text-slate-300 font-medium">
                  Give the app permission to check your phone status and make sure you can call phone numbers directly.
                </p>
                {permissionsState.phone && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold mt-1">
                    <Check className="w-3 h-3" /> Permission active
                  </span>
                )}
              </div>
            </div>

            {/* Item 2: Contacts */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                <div className="relative">
                  <Smartphone className="w-7 h-7 stroke-[1.8]" />
                  <Users className="w-3.5 h-3.5 absolute inset-0 m-auto text-slate-300" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-relaxed text-slate-300 font-medium">
                  To call your friends directly from your contact list please allow access to your contacts.
                </p>
                {permissionsState.contacts && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold mt-1">
                    <Check className="w-3 h-3" /> Permission active
                  </span>
                )}
              </div>
            </div>

            {/* Item 3: Record Audio */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                <Mic className="w-7 h-7 stroke-[1.8]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-relaxed text-slate-300 font-medium">
                  The 'Record Audio' permission is needed to make sure your voice can be sent to the person you are calling.
                </p>
                {permissionsState.audio && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold mt-1">
                    <Check className="w-3 h-3" /> Microphone verified & active
                  </span>
                )}
              </div>
            </div>

            {/* Item 4: Push Notifications */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-slate-300 mt-0.5">
                <Bell className="w-7 h-7 stroke-[1.8]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-relaxed text-slate-300 font-medium">
                  We would like to send you Push Notifications regarding the security and/or important changes of your account and personal offers.
                </p>
                {permissionsState.notifications && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold mt-1">
                    <Check className="w-3 h-3" /> Notifications enabled
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Button: GIVE ACCESS */}
          <div className="pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={allGranted ? () => { onAllGranted?.(); onClose(); } : handleStartPermissionFlow}
              className="w-full py-3.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm uppercase tracking-wider transition active:scale-[0.98] shadow-lg shadow-emerald-950/50 cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 text-white" />
              <span>{allGranted ? 'ALL ALLOWED • READY FOR DIRECT CALL' : 'GIVE ACCESS'}</span>
            </button>
          </div>
        </div>

        {/* ----------------- AUTHENTIC ANDROID POPUP DIALOGS ----------------- */}

        {/* Dialog 1: Phone Calls */}
        {activeStep === 'phone' && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="w-full max-w-[340px] bg-[#27282D] rounded-2xl p-5 shadow-2xl border border-slate-700/60 flex flex-col items-center text-center gap-4 animate-scaleUp">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white">
                <Phone className="w-6 h-6 fill-current text-white" />
              </div>
              <h3 className="text-base font-semibold text-white leading-snug">
                Allow <strong className="text-white">MobileVOIP</strong> to make and manage phone calls?
              </h3>
              <div className="w-full flex flex-col gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => handlePhoneResponse(true)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => handlePhoneResponse(false)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Don't allow
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dialog 2: Contacts */}
        {activeStep === 'contacts' && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="w-full max-w-[340px] bg-[#27282D] rounded-2xl p-5 shadow-2xl border border-slate-700/60 flex flex-col items-center text-center gap-4 animate-scaleUp">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-semibold text-white leading-snug">
                Allow <strong className="text-white">MobileVOIP</strong> to access your contacts?
              </h3>
              <div className="w-full flex flex-col gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleContactsResponse(true)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => handleContactsResponse(false)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Don't allow
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dialog 3: Record Audio (Microphone) */}
        {activeStep === 'audio' && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="w-full max-w-[340px] bg-[#27282D] rounded-2xl p-5 shadow-2xl border border-slate-700/60 flex flex-col items-center text-center gap-3 animate-scaleUp">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white">
                <Mic className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-semibold text-white leading-snug">
                Allow <strong className="text-white">MobileVOIP</strong> to record audio?
              </h3>
              <div className="w-full flex flex-col gap-1 pt-2">
                <button
                  type="button"
                  onClick={() => handleAudioResponse(true)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  While using the app
                </button>
                <button
                  type="button"
                  onClick={() => handleAudioResponse(true)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Only this time
                </button>
                <button
                  type="button"
                  onClick={() => handleAudioResponse(false)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Don't allow
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dialog 4: Push Notifications */}
        {activeStep === 'notifications' && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="w-full max-w-[340px] bg-[#27282D] rounded-2xl p-5 shadow-2xl border border-slate-700/60 flex flex-col items-center text-center gap-4 animate-scaleUp">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-semibold text-white leading-snug">
                Allow <strong className="text-white">MobileVOIP</strong> to send you notifications?
              </h3>
              <div className="w-full flex flex-col gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleNotificationResponse(true)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => handleNotificationResponse(false)}
                  className="w-full py-2.5 px-4 rounded-xl text-[#4DA3FF] hover:bg-slate-800 font-bold text-sm transition cursor-pointer"
                >
                  Don't allow
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step Completed Toast */}
        {activeStep === 'completed' && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-[#27282D] rounded-2xl p-6 shadow-2xl border border-emerald-500/50 flex flex-col items-center text-center gap-2 text-white">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Check className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-emerald-300">All Permissions Configured</h4>
              <p className="text-xs text-slate-300">MobileVOIP is ready for direct live calling.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
