import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, RefreshCw, Users } from 'lucide-react';
import LanguageSelector from '../common/LanguageSelector';
import ThemeSelector from '../common/ThemeSelector';
import { useSettingsStore } from '../../store/settingsStore';
import { useDemoStore } from '../../store/demoStore';
import { getAssetUrl } from '../../utils/appIconHelper';

export default function DemoCapacityView() {
  const { t } = useTranslation();
  const appIcon = useSettingsStore(state => state.appIcon);
  const { retryAfter, checkDemoSession } = useDemoStore();
  
  const [countdown, setCountdown] = useState(retryAfter || 60);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    setCountdown(retryAfter || 60);
  }, [retryAfter]);

  useEffect(() => {
    if (countdown <= 0) {
      handleRetry();
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const handleRetry = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const res = await checkDemoSession();
      if (!res.success) {
        setCountdown(retryAfter || 45);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const iconPath = getAssetUrl(`/icons/${appIcon === 'cassette' ? 'logo_cassette.png' : appIcon === 'wave_light' ? 'favicon_light.png' : 'favicon_dark.png'}`);

  return (
    <div className="h-full w-full bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Language & Theme Selectors */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <ThemeSelector />
        <LanguageSelector />
      </div>

      {/* Main Glassmorphic Card */}
      <div className="w-full max-w-md bg-card/60 backdrop-blur-xl border border-neutral-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col items-center text-center animate-fade-in">
        
        {/* App Logo */}
        <div className="relative mb-6">
          <div className="absolute -inset-2 bg-primary/20 rounded-2xl blur-lg animate-pulse" />
          <img 
            src={iconPath} 
            alt="Holad" 
            className="w-20 h-20 rounded-2xl shadow-xl relative z-10 object-cover border border-white/10" 
          />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4 border border-primary/20">
          <Users size={14} />
          <span>{t('demo.badge', 'Holad Demo Mode')}</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-3">
          {t('demo.capacity_title', 'Демо-сервер перегружен')}
        </h1>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          {t('demo.capacity_desc', 'Сейчас плеер тестирует максимальное количество одновременных пользователей. Пожалуйста, подождите немного, пока освободится слот.')}
        </p>

        {/* Live Timer Card */}
        <div className="w-full bg-background/50 border border-neutral-200/60 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Clock size={18} className="text-primary animate-pulse" />
            <span>{t('demo.auto_retry', 'Автоматическая проверка:')}</span>
          </div>
          <span className="font-mono text-base font-bold text-foreground bg-foreground/5 px-2.5 py-0.5 rounded-lg border border-neutral-200/50 dark:border-white/5">
            {countdown}s
          </span>
        </div>

        {/* Manual Retry Button */}
        <button
          onClick={handleRetry}
          disabled={isChecking}
          className="w-full py-3 px-5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          <RefreshCw size={18} className={isChecking ? 'animate-spin' : ''} />
          <span>{isChecking ? t('demo.checking', 'Проверяем...') : t('demo.retry_btn', 'Проверить доступность')}</span>
        </button>
      </div>
    </div>
  );
}
