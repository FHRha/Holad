import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption<T = any> {
  label: React.ReactNode;
  value: T;
  icon?: React.ReactNode;
}

export type Option<T = any> = DropdownOption<T>;

export interface DropdownProps<T = any> {
  options: DropdownOption<T>[];
  value: any;
  onChange: (value: any) => void;
  className?: string;
  prefix?: string;
}

export default function Dropdown({
  options,
  value,
  onChange,
  className = '',
  prefix = '',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

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
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 bg-black/[0.03] hover:bg-black/[0.06] dark:bg-black/30 dark:hover:bg-black/45 border border-black/10 dark:border-black/50 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground transition-all duration-150 w-full focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 cursor-pointer shadow-xs"
      >
        <div className="flex items-center gap-2.5 truncate min-w-0">
          {selectedOption?.icon && (
            <span className="shrink-0 flex items-center">
              {selectedOption.icon}
            </span>
          )}
          <span className="truncate">
            {prefix}
            {selectedOption?.label}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-secondary shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-foreground' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1.5 w-full min-w-[140px] bg-white/95 dark:bg-[#1a1a1c]/95 backdrop-blur-xl border border-black/10 dark:border-black/60 rounded-xl shadow-2xl shadow-black/20 dark:shadow-[0_16px_48px_rgba(0,0,0,0.85)] p-1.5 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
          <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto custom-scrollbar">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  type="button"
                  key={typeof option.value === 'string' || typeof option.value === 'number' ? option.value : index}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-all duration-100 flex items-center justify-between gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'text-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0">
                    {option.icon && (
                      <span className="shrink-0 flex items-center">
                        {option.icon}
                      </span>
                    )}
                    <span className="truncate">
                      {prefix}
                      {option.label}
                    </span>
                  </div>
                  {isSelected && (
                    <Check size={15} className="text-primary shrink-0 animate-in fade-in zoom-in-75 duration-150" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
