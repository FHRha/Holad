import React from 'react';

export interface SettingRadioOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface SettingRadioGroupProps<T extends string = string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: SettingRadioOption<T>[];
  className?: string;
}

export function SettingRadioGroup<T extends string = string>({
  name,
  value,
  onChange,
  options,
  className = 'space-y-2'
}: SettingRadioGroupProps<T>) {
  return (
    <div className={className}>
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <label
            key={opt.value}
            className={`flex items-center gap-3 cursor-pointer group ${
              opt.disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={isSelected}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className="accent-primary w-4 h-4 cursor-pointer disabled:cursor-not-allowed shrink-0"
            />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="group-hover:text-primary transition-colors text-sm">
                {opt.label}
              </span>
              {opt.description && (
                <span className="text-xs text-secondary mt-0.5">
                  {opt.description}
                </span>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}

export default SettingRadioGroup;
