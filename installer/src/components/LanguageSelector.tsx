import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import FlagIcon from './FlagIcon';
import { Language } from '../types';

interface LanguageSelectorProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  align?: 'left' | 'right';
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  language,
  onLanguageChange,
  align = 'right',
}) => {
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

  const selectLanguage = (lang: Language) => {
    onLanguageChange(lang);
    setIsOpen(false);
  };

  const isRu = language === 'ru';
  const isEn = language === 'en';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Language"
        className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
        title="Language / Язык"
      >
        <Globe size={15} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute top-9 ${
            align === 'left' ? 'left-0' : 'right-0'
          } w-36 bg-[#1a1a1c]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[100] flex flex-col p-1 animate-in fade-in zoom-in-95 duration-150`}
        >
          <button
            type="button"
            onClick={() => selectLanguage('ru')}
            className={`flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all text-left w-full cursor-pointer ${
              isRu
                ? 'bg-primary/20 text-primary font-semibold'
                : 'text-zinc-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <FlagIcon code="ru" size="sm" />
            <span>Русский</span>
            {isRu && <Check size={14} className="text-primary ml-auto shrink-0" />}
          </button>
          <button
            type="button"
            onClick={() => selectLanguage('en')}
            className={`flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all text-left w-full cursor-pointer ${
              isEn
                ? 'bg-primary/20 text-primary font-semibold'
                : 'text-zinc-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <FlagIcon code="en" size="sm" />
            <span>English</span>
            {isEn && <Check size={14} className="text-primary ml-auto shrink-0" />}
          </button>
        </div>
      )}
    </div>
  );
};
