import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Minus, X } from 'lucide-react';
import { Language } from '../types';
import { LanguageSelector } from './LanguageSelector';

interface TitleBarProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  showLanguageToggle?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  language,
  onLanguageChange,
  showLanguageToggle = true,
}) => {
  const handleMinimize = async () => {
    try {
      await invoke('minimize_window');
    } catch {
      // fallback
    }
  };

  const handleClose = async () => {
    try {
      await invoke('exit_app');
    } catch {
      window.close();
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, select')) {
      try {
        await invoke('start_dragging');
      } catch {
        // fallback
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="h-10 w-full flex items-center justify-between px-3.5 bg-black/40 border-b border-white/[0.08] select-none z-50 relative shrink-0 cursor-default"
    >
      {/* Drag region left area with Icon & App Title */}
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <img
          data-tauri-drag-region
          src="/icons/favicon_dark.png"
          alt="Holad"
          className="w-4 h-4 object-contain pointer-events-none drop-shadow"
        />
        <span
          data-tauri-drag-region
          className="text-xs font-bold tracking-wider text-zinc-200 font-sans uppercase pointer-events-none"
        >
          Holad Setup
        </span>
      </div>

      {/* Right controls: Language selector + Window buttons */}
      <div className="flex items-center gap-1.5">
        {showLanguageToggle && (
          <div className="mr-1">
            <LanguageSelector
              language={language}
              onLanguageChange={onLanguageChange}
              align="right"
            />
          </div>
        )}

        {/* Minimize Button */}
        <button
          type="button"
          onClick={handleMinimize}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-red-500/80 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
