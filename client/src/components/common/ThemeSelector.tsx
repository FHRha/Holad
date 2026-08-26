import { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
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
        className="w-10 h-10 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center text-secondary hover:text-foreground transition-colors"
        title={t('settings.appearance.theme.title') || 'Theme'}
      >
        {getThemeIcon()}
      </button>

      {isOpen && (
        <div 
          ref={menuRef}
          className={`absolute top-12 ${align === 'left' ? 'left-0' : 'right-0'} w-40 bg-background/95 backdrop-blur-xl border border-foreground/10 rounded-xl shadow-2xl overflow-hidden z-[70] flex flex-col py-1 animate-in fade-in zoom-in-95 duration-200`}
        >
          <button 
            onClick={() => changeTheme('light')}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors text-left w-full ${theme === 'light' ? 'bg-primary/20 text-primary' : 'text-secondary hover:text-foreground hover:bg-foreground/5'}`}
          >
            <Sun size={16} />
            <span>{t('settings.appearance.theme.light') || 'Light'}</span>
          </button>
          <button 
            onClick={() => changeTheme('dark')}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors text-left w-full ${theme === 'dark' ? 'bg-primary/20 text-primary' : 'text-secondary hover:text-foreground hover:bg-foreground/5'}`}
          >
            <Moon size={16} />
            <span>{t('settings.appearance.theme.dark') || 'Dark'}</span>
          </button>
          <button 
            onClick={() => changeTheme('system')}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors text-left w-full ${theme === 'system' ? 'bg-primary/20 text-primary' : 'text-secondary hover:text-foreground hover:bg-foreground/5'}`}
          >
            <Monitor size={16} />
            <span>{t('settings.appearance.theme.system') || 'System'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
