import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  label: string;
  value: any;
}

interface DropdownProps {
  options: Option[];
  value: any;
  onChange: (value: any) => void;
  className?: string;
  prefix?: string;
}

export default function Dropdown({ options, value, onChange, className = '', prefix = '' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 bg-[#1a1a1a] border border-white/5 hover:border-white/10 rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors w-full focus:outline-none"
      >
        <span className="truncate">{prefix}{selectedOption.label}</span>
        <ChevronDown size={16} className={`text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-2 w-full min-w-[120px] bg-[#222] border border-white/10 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          {options.map(option => (
            <button
              key={option.label}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm font-bold transition-colors ${
                option.value === value ? 'bg-primary text-primary-foreground' : 'text-secondary hover:bg-white/5 hover:text-white'
              }`}
            >
              {prefix}{option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
