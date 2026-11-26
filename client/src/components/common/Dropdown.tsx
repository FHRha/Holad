import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  const updatePosition = useCallback(() => {
    const el = dropdownRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 220 && rect.top > spaceBelow;
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 140),
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      updatePosition();
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 bg-foreground/[0.03] hover:bg-foreground/[0.06] border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground transition-all duration-150 w-full focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 cursor-pointer shadow-xs"
      >
        <div className="flex items-center gap-2.5 min-w-0 text-left">
          {selectedOption?.icon && (
            <span className="shrink-0 flex items-center">
              {selectedOption.icon}
            </span>
          )}
          <span className="text-left break-words leading-snug">
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

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
        >
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
                      : 'text-secondary hover:text-foreground hover:bg-foreground/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    {option.icon && (
                      <span className="shrink-0 flex items-center">
                        {option.icon}
                      </span>
                    )}
                    <span className="text-left break-words leading-snug">
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
        </div>,
        document.body
      )}
    </div>
  );
}
