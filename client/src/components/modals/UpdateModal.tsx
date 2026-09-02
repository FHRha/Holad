import { X, Download, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { UpdateService } from '../../services/UpdateService';
import { isTauri } from '../../utils/StorageManager';
import { openExternalLink } from '../../utils/linkHelper';
import { useSettingsStore } from '../../store/settingsStore';

export default function UpdateModal() {
  const { t } = useTranslation();
  const appIcon = useSettingsStore(state => state.appIcon);
  const { isUpdateModalOpen, setUpdateModalOpen, updateInfo } = useUIStore();

  if (!isUpdateModalOpen || !updateInfo) return null;

  const handleSkip = () => {
    UpdateService.snooze();
    setUpdateModalOpen(false);
  };

  const handleGitHub = () => {
    openExternalLink('https://github.com/FHRha/Holad/releases/latest');
    setUpdateModalOpen(false);
  };

  const handleUpdate = () => {
    UpdateService.performUpdate(updateInfo.downloadUrl);
    setUpdateModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
          <h2 className="text-xl font-bold">
            {t('update.available', 'Update Available')}
          </h2>
          <button 
            onClick={() => setUpdateModalOpen(false)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="text-center flex flex-col items-center">
            <img src={`/icons/${appIcon === 'cassette' ? 'logo_cassette.png' : appIcon === 'wave_light' ? 'favicon_light.png' : 'favicon_dark.png'}`} alt="Holad" className="w-24 h-24 mb-4 object-contain drop-shadow-xl" />
            <span className="inline-block px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-bold mb-4">
              {updateInfo.version ? (updateInfo.version.startsWith('v') ? updateInfo.version : 'v' + updateInfo.version) : 'v??'}
            </span>
            <p className="text-secondary text-sm mb-4">
              {t('update.new_version_desc', 'A new version of Holad is available.')}
            </p>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            {isTauri() && (
              <button 
                onClick={handleUpdate}
                className="flex items-center justify-center gap-3 w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-primary/20"
              >
                <Download size={20} />
                {t('update.auto_update', 'Auto-Update')}
              </button>
            )}

            <button 
              onClick={handleGitHub}
              className="flex items-center justify-center gap-3 w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-colors"
            >
              <img src="/icons/github.png" alt="GitHub" className="w-5 h-5 invert opacity-80" />
              {t('update.download_github', 'Download from GitHub')}
            </button>

            <button 
              onClick={handleSkip}
              className="flex items-center justify-center gap-3 w-full bg-transparent hover:bg-red-500/10 text-red-400 font-bold py-3 rounded-xl border border-transparent transition-colors mt-2"
            >
              <SkipForward size={20} />
              {t('update.skip', 'Skip for now')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
