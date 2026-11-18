import React from 'react';
import { NavigationTab } from '../types';
import { PhoneCall, Activity, Users, FileText, Bot, Radio } from 'lucide-react';

interface HeaderProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  activeCallCount: number;
  onOpenQuickDial: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  activeCallCount,
  onOpenQuickDial
}) => {
  const navItems: { id: NavigationTab; label: string; icon: React.ReactNode }[] = [
    { id: 'simulator', label: 'Call Simulator', icon: <PhoneCall className="w-4 h-4" /> },
    { id: 'dashboard', label: 'Analytics', icon: <Activity className="w-4 h-4" /> },
    { id: 'campaigns', label: 'Campaigns', icon: <Radio className="w-4 h-4" /> },
    { id: 'logs', label: 'Call Logs', icon: <FileText className="w-4 h-4" /> },
    { id: 'agents', label: 'Voice Studio', icon: <Bot className="w-4 h-4" /> },
    { id: 'telephony', label: 'Phone Numbers', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
              <PhoneCall className="h-4 w-4" />
            </div>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); onSelectTab('simulator'); }}
              className="text-lg font-bold tracking-tight text-white hover:text-cyan-400 transition-colors"
            >
              RoboVoiceCall
            </a>
          </div>
          
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800 text-xs text-slate-400">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-slate-300">Trunk Live</span>
            <span className="text-slate-600">·</span>
            <span className="font-mono tabular-nums text-slate-400">{activeCallCount > 0 ? `${activeCallCount} Active` : '0 Active'}</span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800/90 text-cyan-400 shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenQuickDial}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 shadow-md shadow-cyan-500/20 whitespace-nowrap active:scale-[0.98]"
          >
            <PhoneCall className="h-3.5 w-3.5 fill-current" />
            <span>Launch Phone Call</span>
          </button>
        </div>
      </div>

      {/* Mobile subnav */}
      <div className="flex md:hidden overflow-x-auto border-t border-slate-900 px-4 py-2 gap-1 scrollbar-none">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded whitespace-nowrap ${
              currentTab === item.id 
                ? 'bg-slate-800 text-cyan-400 font-medium' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
};
