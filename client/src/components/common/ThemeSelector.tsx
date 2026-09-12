import { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Monitor, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, type AppTheme } from '../../store/settingsStore';

export default function ThemeSelector({ align = 'right' }: { align?: 'left' | 'right' } = {}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { theme, setTheme } = useSettingsStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && 
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={18} />;
      case 'dark': return <Moon size={18} />;
      default: return <Monitor size={18} />;
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center text-secondary hover:text-foreground transition-colors cursor-pointer"
        title={t('settings.theme_title') || 'Theme'}
      >
        {getThemeIcon()}
      </button>

      {isOpen && (
        <div 
          ref={menuRef}
          className={`absolute top-12 ${align === 'left' ? 'left-0' : 'right-0'} w-40 bg-white/95 dark:bg-[#1a1a1c]/95 backdrop-blur-xl border border-black/10 dark:border-black/60 rounded-xl shadow-2xl shadow-black/20 dark:shadow-[0_16px_48px_rgba(0,0,0,0.85)] overflow-hidden z-[70] flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-150`}
        >
          <button 
            type="button"
            onClick={() => changeTheme('light')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all text-left w-full cursor-pointer ${
              theme === 'light'
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Sun size={16} />
            <span>{t('settings.theme_light') || 'Light'}</span>
            {theme === 'light' && <Check size={15} className="text-primary ml-auto shrink-0" />}
          </button>
          <button 
            type="button"
            onClick={() => changeTheme('dark')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all text-left w-full cursor-pointer ${
              theme === 'dark'
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Moon size={16} />
            <span>{t('settings.theme_dark') || 'Dark'}</span>
            {theme === 'dark' && <Check size={15} className="text-primary ml-auto shrink-0" />}
          </button>
          <button 
            type="button"
            onClick={() => changeTheme('system')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all text-left w-full cursor-pointer ${
              theme === 'system'
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Monitor size={16} />
            <span>{t('settings.theme_system') || 'System'}</span>
            {theme === 'system' && <Check size={15} className="text-primary ml-auto shrink-0" />}
          </button>
        </div>
      )}
    </div>
  );
}
