import React from 'react';
import { AppView } from '../types';
import { Home, Calendar, Users, PhoneCall, Settings } from 'lucide-react';

interface BottomNavProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate }) => {
  const tabs: { id: AppView; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
    { id: 'schedule', label: 'Campaigns', icon: <Calendar className="w-5 h-5" />, badge: '5-STEP' },
    { id: 'contacts', label: 'Contacts', icon: <Users className="w-5 h-5" /> },
    { id: 'live_connect', label: 'Connect Live', icon: <PhoneCall className="w-5 h-5" />, badge: 'GOOGLE' },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <nav className="sticky bottom-0 z-30 w-full bg-white border-t border-slate-200 px-2 py-2 flex items-center justify-around shadow-md">
      {tabs.map((tab) => {
        const isActive = currentView === tab.id || (tab.id === 'live_connect' && currentView === 'call') || (tab.id === 'call' && currentView === 'live_connect');
        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2.5 rounded-lg transition relative ${
              isActive
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.badge && (
              <span className="absolute -top-1 right-1 bg-emerald-600 text-white font-mono text-[8px] font-bold px-1 rounded-full uppercase">
                {tab.badge}
              </span>
            )}
            <div className={isActive ? 'text-emerald-600 scale-105 transition-transform' : 'text-slate-400'}>
              {tab.icon}
            </div>
            <span className="text-[11px] font-medium leading-none">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
