import { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import { pushPreferences } from '../../api/preferences';
import FlagIcon from './FlagIcon';

export default function LanguageSelector({ align = 'right' }: { align?: 'left' | 'right' } = {}) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  const changeLanguage = (lng: string) => {
    useSettingsStore.getState().setLanguage(lng);
    if (useSettingsStore.getState().syncLanguage) {
      pushPreferences({ language: lng });
    }
    setIsOpen(false);
  };

  const isRu = i18n.language.startsWith('ru');
  const isEn = i18n.language.startsWith('en');

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 ml-2 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center text-secondary hover:text-foreground transition-colors cursor-pointer"
        title={t('topbar.language')}
      >
        <Globe size={18} />
      </button>

      {isOpen && (
        <div 
          ref={menuRef}
          className={`absolute top-12 ${align === 'left' ? 'left-0' : 'right-0'} w-40 bg-white/95 dark:bg-[#1a1a1c]/95 backdrop-blur-xl border border-black/10 dark:border-black/60 rounded-xl shadow-2xl shadow-black/20 dark:shadow-[0_16px_48px_rgba(0,0,0,0.85)] overflow-hidden z-[70] flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-150`}
        >
          <button 
            type="button"
            onClick={() => changeLanguage('ru')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all text-left w-full cursor-pointer ${
              isRu
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <FlagIcon code="ru" />
            <span>Русский</span>
            {isRu && <Check size={15} className="text-primary ml-auto shrink-0" />}
          </button>
          <button 
            type="button"
            onClick={() => changeLanguage('en')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all text-left w-full cursor-pointer ${
              isEn
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <FlagIcon code="en" />
            <span>English</span>
            {isEn && <Check size={15} className="text-primary ml-auto shrink-0" />}
          </button>
        </div>
      )}
    </div>
  );
}
