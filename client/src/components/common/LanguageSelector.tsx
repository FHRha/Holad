import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function LanguageSelector() {
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
    i18n.changeLanguage(lng);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 ml-2 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-secondary hover:text-foreground transition-colors"
        title={t('topbar.language')}
      >
        <Globe size={18} />
      </button>

      {isOpen && (
        <div 
          ref={menuRef}
          className="absolute top-12 left-0 w-36 bg-background/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[70] flex flex-col py-1 animate-in fade-in zoom-in-95 duration-200"
        >
          <button 
            onClick={() => changeLanguage('ru')}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors text-left w-full ${i18n.language.startsWith('ru') ? 'bg-primary/20 text-primary' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
          >
            <img src="https://flagcdn.com/ru.svg" alt="RU" className="w-5 h-auto rounded-sm object-cover" />
            <span>Русский</span>
          </button>
          <button 
            onClick={() => changeLanguage('en')}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors text-left w-full ${i18n.language.startsWith('en') ? 'bg-primary/20 text-primary' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
          >
            <img src="https://flagcdn.com/us.svg" alt="US" className="w-5 h-auto rounded-sm object-cover" />
            <span>English</span>
          </button>
        </div>
      )}
    </div>
  );
}
