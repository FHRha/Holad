import React, { useState } from 'react';
import { Trash2, Folder, AlertTriangle } from 'lucide-react';
import { Language } from '../types';
import { t } from '../i18n';

interface UninstallViewProps {
  language: Language;
  installPath: string;
  onConfirmUninstall: (deleteUserData: boolean) => void;
  onCancel: () => void;
}

export const UninstallView: React.FC<UninstallViewProps> = ({
  language,
  installPath,
  onConfirmUninstall,
  onCancel,
}) => {
  const [deleteUserData, setDeleteUserData] = useState(false);

  return (
    <div className="flex flex-col flex-1 px-6 py-4 justify-between select-none overflow-y-auto custom-scrollbar">
      {/* Top section: Holad Logo & Title */}
      <div className="flex flex-col items-center pt-2">
        <img
          src="/icons/favicon_dark.png"
          alt="Holad"
          className="w-16 h-16 mb-2 object-contain drop-shadow-xl"
        />

        <h1 className="text-xl font-bold tracking-tight text-white font-sans">
          {t(language, 'uninstallTitle')}
        </h1>

        <div className="mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{t(language, 'uninstallDesc')}</span>
        </div>
      </div>

      {/* Middle section: Path details and options */}
      <div className="w-full my-4 space-y-3">
        {/* Path Card */}
        <div className="p-3 rounded-xl bg-card border border-border shadow-sm">
          <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-zinc-300">
            <Folder size={14} className="text-zinc-400" />
            <span>{t(language, 'installPath')}</span>
          </div>
          <div className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-white/10 text-xs text-zinc-400 font-mono truncate">
            {installPath || 'C:\\Program Files\\Holad'}
          </div>
        </div>

        {/* Option to clear user data */}
        <div className="p-3 rounded-xl bg-card border border-border">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={deleteUserData}
              onChange={(e) => setDeleteUserData(e.target.checked)}
              className="accent-red-500 w-4 h-4 rounded cursor-pointer"
            />
            <span>{t(language, 'deleteUserData')}</span>
          </label>
        </div>
      </div>

      {/* Bottom section: Action buttons */}
      <div className="space-y-2 pt-1 pb-1">
        <button
          type="button"
          onClick={() => onConfirmUninstall(deleteUserData)}
          className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-red-900/30 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>{t(language, 'uninstallBtn')}</span>
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-medium text-xs tracking-wide border border-white/10 transition-colors flex items-center justify-center cursor-pointer"
        >
          <span>{t(language, 'cancel')}</span>
        </button>
      </div>
    </div>
  );
};

export default UninstallView;
