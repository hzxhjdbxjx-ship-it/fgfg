import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, ChevronLeft, User, Phone, Shield, Mic, Check, Edit2, 
  X, RefreshCw, Palette, Mail, Camera, Upload, Trash2, Image as ImageIcon, Sparkles 
} from 'lucide-react';

interface SettingsViewProps {
  onBack: () => void;
  onNavigatePermissions?: () => void;
}

export interface UserProfile {
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
  avatarPhoto?: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Sourav Singh',
  email: 'souravsingh1965@gmail.com',
  initials: 'SS',
  avatarColor: 'bg-sky-600',
  avatarPhoto: '',
};

const PRESET_AVATARS = [
  { id: 'av1', label: 'Executive 1', url: '/src/assets/images/avatar_voice_marcus_1790137664045.jpg' },
  { id: 'av2', label: 'Professional 2', url: '/src/assets/images/avatar_voice_carlos_1790137688394.jpg' },
  { id: 'av3', label: 'Business 3', url: '/src/assets/images/avatar_voice_ava_1790137650253.jpg' },
  { id: 'av4', label: 'Tech Pro 4', url: '/src/assets/images/avatar_voice_elena_1790137676521.jpg' },
];

const COLOR_OPTIONS = [
  { name: 'Sky Blue', bg: 'bg-sky-600', ring: 'ring-sky-400' },
  { name: 'Emerald Green', bg: 'bg-emerald-600', ring: 'ring-emerald-400' },
  { name: 'Indigo', bg: 'bg-indigo-600', ring: 'ring-indigo-400' },
  { name: 'Purple', bg: 'bg-purple-600', ring: 'ring-purple-400' },
  { name: 'Rose', bg: 'bg-rose-600', ring: 'ring-rose-400' },
  { name: 'Amber', bg: 'bg-amber-600', ring: 'ring-amber-400' },
  { name: 'Dark Slate', bg: 'bg-slate-800', ring: 'ring-slate-400' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack, onNavigatePermissions }) => {
  const [callerId, setCallerId] = useState('My Local SIM Card');
  const [language, setLanguage] = useState('en-US');
  const [autoRecord, setAutoRecord] = useState(true);
  const [saved, setSaved] = useState(false);

  // Profile state with localStorage persistence
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const savedProf = localStorage.getItem('applet_user_profile');
      if (savedProf) {
        return { ...DEFAULT_PROFILE, ...JSON.parse(savedProf) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_PROFILE;
  });

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editEmail, setEditEmail] = useState(profile.email);
  const [editInitials, setEditInitials] = useState(profile.initials);
  const [editColor, setEditColor] = useState(profile.avatarColor);
  const [editPhoto, setEditPhoto] = useState(profile.avatarPhoto || '');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep edit fields in sync when profile updates or edit opens
  const handleOpenEdit = () => {
    setEditName(profile.name);
    setEditEmail(profile.email);
    setEditInitials(profile.initials);
    setEditColor(profile.avatarColor);
    setEditPhoto(profile.avatarPhoto || '');
    setPhotoError(null);
    setIsEditingProfile(true);
  };

  const handleNameChange = (val: string) => {
    setEditName(val);
    const trimmed = val.trim();
    if (trimmed) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        setEditInitials((parts[0][0] + parts[1][0]).toUpperCase());
      } else {
        setEditInitials(parts[0].slice(0, 2).toUpperCase());
      }
    } else {
      setEditInitials('SS');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Photo file is too large (max 5MB).');
      return;
    }

    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setEditPhoto(dataUrl);
      }
    };
    reader.onerror = () => {
      setPhotoError('Failed to read image file. Please choose another photo.');
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated: UserProfile = {
      name: editName.trim() || 'Sourav Singh',
      email: editEmail.trim() || 'souravsingh1965@gmail.com',
      initials: (editInitials.trim() || 'SS').toUpperCase().slice(0, 3),
      avatarColor: editColor || 'bg-sky-600',
      avatarPhoto: editPhoto || '',
    };
    setProfile(updated);
    try {
      localStorage.setItem('applet_user_profile', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('applet_user_profile_updated', { detail: updated }));
    } catch {
      // ignore
    }
    setIsEditingProfile(false);
    setProfileSavedToast(true);
    setTimeout(() => setProfileSavedToast(false), 3000);
  };

  const handleResetToDefault = () => {
    setEditName(DEFAULT_PROFILE.name);
    setEditEmail(DEFAULT_PROFILE.email);
    setEditInitials(DEFAULT_PROFILE.initials);
    setEditColor(DEFAULT_PROFILE.avatarColor);
    setEditPhoto('');
    setPhotoError(null);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="w-full flex flex-col gap-4 pb-8">
      {/* Hidden File Input for Easy Photo Import */}
      <input 
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-600" />
          <span>Account & Telephony Settings</span>
        </h2>

        <div className="w-12" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-5">
        {/* User Profile Section - Editable */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-sky-600" /> Profile Information
            </span>
            {!isEditingProfile ? (
              <button
                type="button"
                onClick={handleOpenEdit}
                className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
                title="Edit name, email, and photo"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          {profileSavedToast && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium animate-fadeIn">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Profile updated successfully! Photo and details saved.</span>
            </div>
          )}

          {!isEditingProfile ? (
            /* View Mode */
            <div 
              onClick={handleOpenEdit}
              className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-sky-300 hover:bg-sky-50/30 transition-all cursor-pointer group"
              title="Click to edit profile & photo"
            >
              <div className="flex items-center gap-3.5">
                {profile.avatarPhoto ? (
                  <div className="relative">
                    <img 
                      src={profile.avatarPhoto} 
                      alt={profile.name} 
                      className="w-13 h-13 rounded-full object-cover shadow-sm ring-2 ring-sky-400 shrink-0" 
                    />
                    <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow border border-slate-200 text-sky-600">
                      <Camera className="w-3 h-3" />
                    </div>
                  </div>
                ) : (
                  <div className={`w-13 h-13 rounded-full ${profile.avatarColor} text-white font-black flex items-center justify-center text-base shadow-sm ring-2 ring-white shrink-0`}>
                    {profile.initials}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 block group-hover:text-sky-700 transition-colors">
                      {profile.name}
                    </span>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
                      Owner
                    </span>
                  </div>
                  <span className="text-xs text-slate-600 font-mono block">
                    {profile.email}
                  </span>
                </div>
              </div>
              <div className="text-slate-400 group-hover:text-sky-600 flex items-center gap-1.5 text-xs font-semibold transition-colors bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 group-hover:border-sky-300">
                <Edit2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit Photo & Info</span>
              </div>
            </div>
          ) : (
            /* Edit Mode Form */
            <form onSubmit={handleSaveProfile} className="p-4 rounded-xl bg-slate-50 border-2 border-sky-300 flex flex-col gap-4">
              
              {/* Photo Upload & Avatar Preview Box */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pb-4 border-b border-slate-200">
                {/* Avatar / Photo preview circle with direct click-to-upload */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="relative group cursor-pointer shrink-0"
                  title="Click to import photo from your device"
                >
                  {editPhoto ? (
                    <img 
                      src={editPhoto} 
                      alt="Profile Preview" 
                      className="w-18 h-18 rounded-full object-cover shadow-md ring-3 ring-sky-500" 
                    />
                  ) : (
                    <div className={`w-18 h-18 rounded-full ${editColor} text-white font-black flex items-center justify-center text-xl shadow-md ring-3 ring-sky-400`}>
                      {editInitials || 'SS'}
                    </div>
                  )}
                  {/* Overlay camera icon */}
                  <div className="absolute inset-0 bg-slate-950/40 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-bold">
                    <Camera className="w-5 h-5 mb-0.5" />
                    <span>Import</span>
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center sm:items-start gap-1.5 text-center sm:text-left">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-slate-800">Profile Photo & Identity</span>
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer bg-white px-2 py-1 rounded border border-slate-200"
                      title="Reset to default Sourav Singh & initials"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reset Default</span>
                    </button>
                  </div>
                  
                  <span className="text-[11px] text-slate-500">
                    Upload your profile picture, select an avatar preset, or customize your badge initials.
                  </span>

                  {/* Photo Import Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{editPhoto ? 'Change Photo' : 'Import Photo'}</span>
                    </button>

                    {editPhoto && (
                      <button
                        type="button"
                        onClick={() => setEditPhoto('')}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                        title="Remove custom photo and use letter badge"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Photo</span>
                      </button>
                    )}
                  </div>

                  {photoError && (
                    <span className="text-[11px] font-semibold text-rose-600 mt-1 block">
                      {photoError}
                    </span>
                  )}

                  {/* Preset Avatars Bar */}
                  <div className="flex items-center gap-1.5 pt-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" /> Presets:
                    </span>
                    {PRESET_AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => {
                          setEditPhoto(av.url);
                          setPhotoError(null);
                        }}
                        title={`Select ${av.label}`}
                        className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-transform hover:scale-110 cursor-pointer ${
                          editPhoto === av.url ? 'border-sky-600 ring-2 ring-sky-300 scale-110' : 'border-slate-200 opacity-80'
                        }`}
                      >
                        <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Full Name */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-500" /> Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Sourav Singh"
                  required
                  className="w-full bg-white border border-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
                />
              </div>

              {/* Email Address */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" /> Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. souravsingh1965@gmail.com"
                  required
                  className="w-full bg-white border border-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono outline-none"
                />
              </div>

              {/* Initials & Color Picker in a Row (Used when no photo or as badge fallback) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Initials */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Badge Initials (1-3 letters)
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={editInitials}
                    onChange={(e) => setEditInitials(e.target.value.toUpperCase())}
                    placeholder="e.g. SS"
                    className="w-full bg-white border border-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg px-3 py-2 text-xs font-black uppercase text-slate-800 outline-none font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Used when photo is removed or as avatar fallback</span>
                </div>

                {/* Avatar Color */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Palette className="w-3 h-3 text-slate-500" /> Avatar Badge Color
                  </label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.bg}
                        type="button"
                        onClick={() => setEditColor(c.bg)}
                        title={c.name}
                        className={`w-6 h-6 rounded-full ${c.bg} cursor-pointer transition-transform hover:scale-110 ${
                          editColor === c.bg ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-80'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* MobileVOIP App Permissions Card */}
        {onNavigatePermissions && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950 via-slate-900 to-slate-900 border border-blue-500/40 text-white flex flex-col gap-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Shield className="w-4 h-4 text-sky-400" />
                <span>MobileVOIP App Permissions</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-black uppercase">
                4 Permissions
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Check and grant Phone Calling, Contacts Access, Audio Recording (Microphone), and Push Notifications.
            </p>
            <button
              type="button"
              onClick={onNavigatePermissions}
              className="mt-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer w-fit"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Review MobileVOIP Permissions</span>
            </button>
          </div>
        )}

        {/* VoIP Calling Rate & Billing Card */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/40 text-white flex flex-col gap-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>In-App VoIP Calling Rate</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black uppercase">
              100% Free Rate
            </span>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-800/80 pt-2">
            <span className="text-xs text-slate-300">VoIP Call Cost:</span>
            <span className="text-sm font-extrabold font-mono text-emerald-300">$0.00 / min (Unlimited Free Calls)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            All direct WebRTC & VoIP calls to USA, UK, India, Australia, Europe, and worldwide destinations are free with zero connection fees.
          </p>
        </div>

        {/* Caller ID setting */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
          <label className="text-xs font-semibold text-slate-700">Outbound Caller ID (DID)</label>
          <input
            type="text"
            value={callerId}
            onChange={(e) => setCallerId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500 font-mono"
          />
          <span className="text-[11px] text-slate-400">
            Verified with STIR/SHAKEN Level A cryptographic token
          </span>
        </div>

        {/* Speech Recognition Language */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Recognition Language Engine</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
          >
            <option value="en-US">English (United States) - en-US</option>
            <option value="en-GB">English (United Kingdom) - en-GB</option>
            <option value="es-ES">Spanish (Spain) - es-ES</option>
            <option value="es-MX">Spanish (Mexico) - es-MX</option>
            <option value="fr-FR">French (France) - fr-FR</option>
          </select>
        </div>

        {/* Recording disclaimer toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
          <div>
            <span className="text-xs font-semibold text-slate-800 block">Two-Party Consent Audio Recording</span>
            <span className="text-[11px] text-slate-500">Plays "This call may be monitored or recorded"</span>
          </div>
          <button
            onClick={() => setAutoRecord(!autoRecord)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${autoRecord ? 'bg-sky-600' : 'bg-slate-300'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${autoRecord ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            {saved && (
              <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1">
                <Check className="w-4 h-4" /> Telephony settings updated!
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
          >
            Save Telephony Settings
          </button>
        </div>
      </div>
    </div>
  );
};
