import React, { useState } from 'react';
import {
  Folder,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Music,
} from 'lucide-react';
import { InstallOptions } from '../types';
import { t } from '../i18n';

interface CleanInstallViewProps {
  version: string;
  options: InstallOptions;
  onChangeOptions: (updated: Partial<InstallOptions>) => void;
  onBrowsePath: () => void;
  onBrowseMusicPath: () => void;
  onStartInstall: () => void;
}

export const CleanInstallView: React.FC<CleanInstallViewProps> = ({
  version,
  options,
  onChangeOptions,
  onBrowsePath,
  onBrowseMusicPath,
  onStartInstall,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const lang = options.language;

  return (
    <div className="flex flex-col flex-1 px-6 py-4 justify-between select-none overflow-y-auto custom-scrollbar">
      {/* Top section: Holad Logo & Version (NO slogans!) */}
      <div className="flex flex-col items-center pt-1">
        <img
          src="/icons/favicon_dark.png"
          alt="Holad"
          className="w-16 h-16 mb-2 object-contain drop-shadow-xl"
        />

        <h1 className="text-xl font-bold tracking-tight text-white font-sans">
          Holad
        </h1>
        <span className="mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide bg-primary/15 border border-primary/30 text-primary">
          v{version}
        </span>
      </div>

      {/* Middle section: Collapsible options */}
      <div className="w-full my-2 space-y-2">
        {/* Path Card */}
        <div className="p-3 rounded-xl bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Folder size={14} className="text-primary" />
              {t(lang, 'installPath')}
            </span>
            <button
              type="button"
              onClick={onBrowsePath}
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              {t(lang, 'browse')}
            </button>
          </div>
          <input
            type="text"
            value={options.installPath}
            onChange={(e) => onChangeOptions({ installPath: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-white/10 text-xs text-zinc-200 font-mono outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Extra Settings Toggle */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HardDrive size={14} className="text-primary" />
              <span>{t(lang, 'advancedOptions')}</span>
            </div>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showAdvanced && (
            <div className="px-3 pb-3 pt-2 space-y-3 border-t border-white/5 animate-in fade-in duration-150">
              {/* Music Download Path */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Music size={13} className="text-primary" />
                    {t(lang, 'musicPath')}
                  </span>
                  <button
                    type="button"
                    onClick={onBrowseMusicPath}
                    className="text-xs font-medium text-primary hover:underline cursor-pointer"
                  >
                    {t(lang, 'browse')}
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
                    onChangeOptions({
                      createDesktopShortcut: e.target.checked,
                    })
                  }
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
                <span>{t(lang, 'desktopShortcut')}</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={options.createStartMenuShortcut}
                  onChange={(e) =>
                    onChangeOptions({
                      createStartMenuShortcut: e.target.checked,
                    })
                  }
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
                <span>{t(lang, 'startMenuShortcut')}</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={options.enableAutostart}
                  onChange={(e) =>
                    onChangeOptions({
                      enableAutostart: e.target.checked,
                    })
                  }
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
                <span>{t(lang, 'autostart')}</span>
              </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom section: Install button */}
      <div className="pt-2 pb-1">
        <button
          type="button"
          onClick={onStartInstall}
          className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm tracking-wide shadow-lg shadow-primary/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{t(lang, 'install')}</span>
        </button>
      </div>
    </div>
  );
};
