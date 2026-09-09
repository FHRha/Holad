import { X, Download, SkipForward, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { UpdateService } from '../../services/UpdateService';
import { isTauri, isCapacitor } from '../../utils/StorageManager';
import { openExternalLink } from '../../utils/linkHelper';
import { useSettingsStore } from '../../store/settingsStore';

export default function UpdateModal() {
  const { t } = useTranslation();
  const appIcon = useSettingsStore(state => state.appIcon);
  const { isUpdateModalOpen, setUpdateModalOpen, updateInfo, setUpdateProgress } = useUIStore();

  if (!isUpdateModalOpen || !updateInfo) return null;

  const isDownloading = updateInfo.progress?.stage === 'downloading';
  const isInstalling = updateInfo.progress?.stage === 'installing';
  const isPermissionRequired = updateInfo.progress?.stage === 'permission_required';
  const isBusy = isDownloading || isInstalling;
  const isError = updateInfo.progress?.stage === 'error';

  const handleSkip = () => {
    if (isBusy) return;
    UpdateService.snooze();
    setUpdateProgress(null);
    setUpdateModalOpen(false);
  };

  const handleGitHub = () => {
    openExternalLink('https://github.com/FHRha/Holad/releases/latest');
    if (!isBusy) {
      setUpdateProgress(null);
      setUpdateModalOpen(false);
    }
  };

  const handleUpdate = () => {
    UpdateService.performUpdate();
  };

  const handleClose = () => {
    if (isBusy) return;
    setUpdateProgress(null);
    setUpdateModalOpen(false);
  };

  const progress = updateInfo.progress;
  const percent = progress?.percent ?? 0;
  const downloadedMb = ((progress?.downloaded || 0) / (1024 * 1024)).toFixed(1);
  const totalMb = progress?.total 
    ? ((progress.total) / (1024 * 1024)).toFixed(1) 
    : (updateInfo.size ? (updateInfo.size / (1024 * 1024)).toFixed(1) : '');

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
          <h2 className="text-xl font-bold">
            {t('update.available', 'Update Available')}
          </h2>
          {!isBusy && (
            <button 
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="text-center flex flex-col items-center">
            <img 
              src={`/icons/${appIcon === 'cassette' ? 'logo_cassette.png' : appIcon === 'wave_light' ? 'favicon_light.png' : 'favicon_dark.png'}`} 
              alt="Holad" 
              className="w-24 h-24 mb-4 object-contain drop-shadow-xl" 
            />
            <span className="inline-block px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-bold mb-2">
              {updateInfo.version ? (updateInfo.version.startsWith('v') ? updateInfo.version : 'v' + updateInfo.version) : 'v??'}
            </span>
            <p className="text-secondary text-sm mb-2">
              {t('update.new_version_desc', 'A new version of Holad is available.')}
            </p>
          </div>

          {/* Progress or Error view */}
          {isDownloading && (
            <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center justify-between text-xs font-medium text-secondary">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  {t('update.downloading', 'Downloading update...')}
                </span>
                <span>{percent.toFixed(0)}%{totalMb ? ` (${downloadedMb} / ${totalMb} MB)` : ''}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-150 ease-out" 
                  style={{ width: `${Math.max(percent, 3)}%` }}
                />
              </div>
            </div>
          )}

          {isInstalling && (
            <div className="flex items-center justify-center gap-2.5 p-4 bg-primary/10 rounded-xl border border-primary/20 text-primary text-sm font-medium animate-pulse">
              <Loader2 size={18} className="animate-spin" />
              <span>{t('update.installing', 'Launching installer...')}</span>
            </div>
          )}

          {isPermissionRequired && (
            <div className="flex flex-col gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} className="shrink-0 text-amber-400 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-amber-300">{t('update.permission_required', 'Install permission required')}</span>
                  <span className="opacity-90">{t('update.permission_desc', 'To install the update, please allow Holad to install apps in settings.')}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => UpdateService.requestInstallPermission()}
                  className="flex-1 py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold rounded-lg border border-amber-500/30 transition-colors"
                >
                  {t('update.open_settings', 'Open Settings')}
                </button>
                {progress?.filePath && (
                  <button
                    onClick={() => UpdateService.installDownloadedApk(progress.filePath!)}
                    className="flex-1 py-2 px-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg transition-colors"
                  >
                    {t('update.install', 'Install')}
                  </button>
                )}
              </div>
            </div>
          )}

          {isError && (
            <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{t('update.download_failed', 'Failed to download update')}</span>
                <span className="opacity-80">{progress?.error}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-2">
            {(isTauri() || isCapacitor()) && !isBusy && !isPermissionRequired && (
              <button 
                onClick={handleUpdate}
                className="flex items-center justify-center gap-3 w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-primary/20"
              >
                <Download size={20} />
                {isError ? t('update.retry', 'Retry') : t('update.auto_update', 'Auto-Update')}
              </button>
            )}

            {!isBusy && (
              <button 
                onClick={handleGitHub}
                className="flex items-center justify-center gap-3 w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-colors"
              >
                <img src="/icons/github.png" alt="GitHub" className="w-5 h-5 invert opacity-80" />
                {t('update.download_github', 'Download from GitHub')}
              </button>
            )}

            {!isBusy && (
              <button 
                onClick={handleSkip}
                className="flex items-center justify-center gap-3 w-full bg-transparent hover:bg-red-500/10 text-red-400 font-bold py-3 rounded-xl border border-transparent transition-colors mt-1"
              >
                <SkipForward size={20} />
                {t('update.skip', 'Skip for now')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
