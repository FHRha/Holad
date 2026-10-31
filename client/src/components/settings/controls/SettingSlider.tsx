import React from 'react';

export interface SettingSliderProps {
  label?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  valueDisplay?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const SettingSlider: React.FC<SettingSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  valueDisplay,
  disabled = false,
  className = ''
}) => {
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}>
      {(label || valueDisplay !== undefined) && (
        <div className="flex justify-between items-center text-xs text-secondary">
          {label && <span>{label}</span>}
          {valueDisplay !== undefined && <span className="font-mono">{valueDisplay}</span>}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-foreground/10 rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
};

export default SettingSlider;
