import React, { useState } from 'react';
import { ArrowRight, Folder, ChevronDown, ChevronUp, RefreshCw, Music } from 'lucide-react';
import { InstallOptions, Language } from '../types';
import { t } from '../i18n';

interface UpgradeViewProps {
  language: Language;
  oldVersion: string;
  newVersion: string;
  options: InstallOptions;
  onChangeOptions: (patch: Partial<InstallOptions>) => void;
  onBrowsePath: () => void;
  onBrowseMusicPath: () => void;
  onUpgrade: () => void;
}

export const UpgradeView: React.FC<UpgradeViewProps> = ({
  language,
  oldVersion,
  newVersion,
  options,
  onChangeOptions,
  onBrowsePath,
  onBrowseMusicPath,
  onUpgrade,
}) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col flex-1 px-6 py-4 justify-between select-none overflow-y-auto custom-scrollbar">
      {/* Top section: Holad Logo & Version Transition */}
      <div className="flex flex-col items-center pt-1">
        <img
          src="/icons/favicon_dark.png"
          alt="Holad"
          className="w-16 h-16 mb-2 object-contain drop-shadow-xl"
        />

        <h1 className="text-xl font-bold tracking-tight text-white font-sans">
          {t(language, 'appTitle')}
        </h1>

        {/* Version transition badge vOld -> vNew */}
        <div className="mt-2.5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
          <span className="text-xs font-medium text-zinc-400">
            v{oldVersion}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold text-primary">
            v{newVersion}
          </span>
        </div>
      </div>

      {/* Middle section: Installation path & Settings */}
      <div className="my-2 space-y-2">
        {/* Path Card */}
        <div className="p-3 rounded-xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Folder size={14} className="text-primary" />
              {t(language, 'installPath')}
            </span>
            <button
              type="button"
              onClick={onBrowsePath}
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              {t(language, 'browse')}
            </button>
          </div>
          <input
            type="text"
            value={options.installPath}
            onChange={(e) => onChangeOptions({ installPath: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-white/10 text-xs text-zinc-200 font-mono outline-none focus:border-primary transition-colors"
          />
          <div className="mt-1 text-[10px] text-zinc-500">
            {t(language, 'detectedPathNotice')}
          </div>
        </div>

        {/* Expandable Extra Settings Toggle */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <span>{t(language, 'advancedOptions')}</span>
            {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showSettings && (
            <div className="px-3 pb-3 pt-2 space-y-3 border-t border-white/5 animate-in fade-in duration-150">
              {/* Music Download Path */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Music size={13} className="text-primary" />
                    {t(language, 'musicPath')}
                  </span>
                  <button
                    type="button"
                    onClick={onBrowseMusicPath}
                    className="text-xs font-medium text-primary hover:underline cursor-pointer"
                  >
                    {t(language, 'browse')}
                  </button>
                </div>
                <input
                  type="text"
                  value={options.musicPath}
                  onChange={(e) => onChangeOptions({ musicPath: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-white/10 text-xs text-zinc-200 font-mono outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-2 pt-1 border-t border-white/5">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={options.createDesktopShortcut}
                  onChange={(e) =>
                    onChangeOptions({ createDesktopShortcut: e.target.checked })
                  }
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
                <span>{t(language, 'desktopShortcut')}</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={options.createStartMenuShortcut}
                  onChange={(e) =>
                    onChangeOptions({ createStartMenuShortcut: e.target.checked })
                  }
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
                <span>{t(language, 'startMenuShortcut')}</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={options.enableAutostart}
                  onChange={(e) =>
                    onChangeOptions({ enableAutostart: e.target.checked })
                  }
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
                <span>{t(language, 'autostart')}</span>
              </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom section: Single primary Upgrade button */}
      <div className="pt-2 pb-1">
        <button
          type="button"
          onClick={onUpgrade}
          className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm tracking-wide shadow-lg shadow-primary/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{t(language, 'upgrade')}</span>
        </button>
      </div>
    </div>
  );
};
