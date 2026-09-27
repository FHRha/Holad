import React, { useState } from 'react';
import { CheckCircle2, Play, AlertTriangle } from 'lucide-react';
import { Language } from '../types';
import { t } from '../i18n';

interface FinishedViewProps {
  language: Language;
  isUpgrade: boolean;
  isUninstall?: boolean;
  error?: string | null;
  onFinish: (launchApp: boolean) => void;
  onRetry?: () => void;
}

export const FinishedView: React.FC<FinishedViewProps> = ({
  language,
  isUpgrade,
  isUninstall = false,
  error,
  onFinish,
  onRetry,
}) => {
  const [launchApp, setLaunchApp] = useState(true);

  if (error) {
    return (
      <div className="flex flex-col flex-1 px-6 py-6 justify-between select-none">
        <div className="flex flex-col items-center pt-4">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/10">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {t(language, 'errorTitle')}
          </h2>
          <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20 text-rose-300 text-xs max-h-32 overflow-y-auto w-full text-center">
            {error}
          </div>
        </div>

        <div className="space-y-2 pt-2 pb-1">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition shadow-lg shadow-primary/20 cursor-pointer"
            >
              {t(language, 'retry')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onFinish(false)}
            className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs transition cursor-pointer"
          >
            {t(language, 'close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 px-6 py-6 justify-between select-none">
      <div className="flex flex-col items-center pt-4">
        {/* Animated Checkmark with Holad Glow */}
        <div className="relative mb-5">
          <div className="absolute -inset-2 rounded-full bg-primary/20 blur-xl animate-pulse-slow" />
          <div className="relative w-16 h-16 rounded-full bg-[#1e1e1e] border border-primary/40 flex items-center justify-center text-primary shadow-2xl">
            <CheckCircle2 className="w-10 h-10 stroke-[2.2] text-primary" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white mb-1.5 font-sans">
          {isUninstall ? t(language, 'uninstallSuccessTitle') : t(language, 'successTitle')}
        </h2>
        <p className="text-xs text-zinc-400 text-center max-w-[280px]">
          {isUninstall
            ? t(language, 'uninstallSuccessDesc')
            : isUpgrade
            ? t(language, 'successUpgradeDesc')
            : t(language, 'successCleanDesc')}
        </p>
      </div>

      <div className="w-full space-y-4 pb-1">
        {/* Launch checkbox only if not uninstalled */}
        {!isUninstall && (
          <label className="flex items-center justify-center gap-2.5 cursor-pointer py-1 text-xs text-zinc-300 hover:text-white transition">
            <input
              type="checkbox"
              checked={launchApp}
              onChange={(e) => setLaunchApp(e.target.checked)}
              className="accent-primary w-4 h-4 rounded cursor-pointer"
            />
            <div className="flex items-center gap-1.5 font-medium">
              <Play className="w-3.5 h-3.5 text-primary fill-primary" />
              <span>{t(language, 'launchApp')}</span>
            </div>
          </label>
        )}

        {/* Finish button */}
        <button
          type="button"
          onClick={() => onFinish(!isUninstall && launchApp)}
          className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm tracking-wide shadow-lg shadow-primary/20 transition-all duration-150 cursor-pointer"
        >
          {isUninstall ? t(language, 'close') : t(language, 'finish')}
        </button>
      </div>
    </div>
  );
};
