import { useState } from 'react';
import { X, CloudOff, HardDriveDownload, Sparkles, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import { toggleOfflineMode } from '../../utils/networkStatus';

interface Props {
  isOpen?: boolean;
  onClose: () => void;
  onToggleOffline?: () => void;
}

export default function OfflineModeModal({ isOpen = true, onClose, onToggleOffline }: Props) {
  const { t } = useTranslation();
  const { hideOfflineExplanationModal, setHideOfflineExplanationModal } = useSettingsStore();
  const [dontShowAgain, setDontShowAgain] = useState(hideOfflineExplanationModal);

  if (!isOpen) return null;

  const handleCheckboxChange = (checked: boolean) => {
    setDontShowAgain(checked);
    setHideOfflineExplanationModal(checked);
  };

  const handleConfirm = () => {
    if (dontShowAgain !== hideOfflineExplanationModal) {
      setHideOfflineExplanationModal(dontShowAgain);
    }
    onClose();
  };

  const handleToggle = () => {
    if (dontShowAgain !== hideOfflineExplanationModal) {
      setHideOfflineExplanationModal(dontShowAgain);
    }
    if (onToggleOffline) {
      onToggleOffline();
    } else {
      toggleOfflineMode();
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200 p-4"
      onClick={onClose}
      data-testid="offline-mode-modal"
    >
      <div 
        className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
              <CloudOff size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {t('offline_modal.title', { defaultValue: 'Офлайн-режим' })}
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary uppercase tracking-wider mt-0.5">
                <Sparkles size={11} />
                {t('common.offline', { defaultValue: 'Офлайн' })}
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            data-testid="offline-modal-close-btn"
            className="p-2 rounded-full text-secondary hover:text-foreground hover:bg-white/10 transition-colors"
            title={t('player.close', { defaultValue: 'Закрыть' })}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-2 flex flex-col gap-4 text-sm text-secondary">
          <p className="leading-relaxed text-secondary/90">
            {t('offline_modal.description', { 
              defaultValue: 'Holad находится в офлайн-режиме. В этом режиме доступно воспроизведение только ранее сохранённых треков и альбомов.' 
            })}
          </p>

          <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
              <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Check size={12} />
              </div>
              <span>{t('offline_modal.feature_local', { defaultValue: 'Воспроизведение без подключения к интернету' })}</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
              <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <HardDriveDownload size={12} />
              </div>
              <span>{t('offline_modal.feature_cache', { defaultValue: 'Использование локально сохранённых обложек и аудио' })}</span>
            </div>
          </div>

          {/* Don't show again Checkbox */}
          <label className="flex items-center gap-3 cursor-pointer select-none py-2 px-1 rounded-lg hover:bg-white/5 transition-colors group">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleCheckboxChange(e.target.checked)}
              data-testid="offline-modal-dont-show-checkbox"
              className="w-4 h-4 rounded text-primary focus:ring-primary/50 accent-primary cursor-pointer"
            />
            <span className="text-xs text-secondary group-hover:text-foreground transition-colors font-medium">
              {t('offline_modal.dont_show_again', { defaultValue: 'Больше не показывать' })}
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-2.5">
          <button
            onClick={handleToggle}
            data-testid="offline-modal-toggle-btn"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-foreground hover:bg-white/10 transition-colors"
          >
            {t('offline_modal.go_online', { defaultValue: 'Выйти из офлайна' })}
          </button>
          <button
            onClick={handleConfirm}
            data-testid="offline-modal-confirm-btn"
            className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20"
          >
            {t('offline_modal.got_it', { defaultValue: 'Понятно' })}
          </button>
        </div>
      </div>
    </div>
  );
}
