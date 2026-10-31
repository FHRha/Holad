import React from 'react';

export interface SettingToggleProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const SettingToggle: React.FC<SettingToggleProps> = ({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  className = '',
  id
}) => {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between cursor-pointer group gap-3 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="group-hover:text-primary transition-colors text-sm font-medium leading-snug min-w-0 flex-1">
          {title}
        </span>
        {description && (
          <span className="text-xs text-secondary mt-0.5 leading-normal">
            {description}
          </span>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary w-4 h-4 rounded cursor-pointer shrink-0 disabled:cursor-not-allowed"
      />
    </label>
  );
};

export default SettingToggle;
