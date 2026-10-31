import type { ReactNode } from 'react';

export interface FilterChipProps {
  icon?: ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  testId?: string;
  className?: string;
}

export function FilterChip({
  icon,
  label,
  isActive = false,
  onClick,
  testId,
  className = '',
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-all border ${
        isActive
          ? 'bg-primary text-primary-foreground border-transparent shadow-sm shadow-primary/25'
          : 'bg-card border border-border text-secondary hover:bg-foreground/[0.06] hover:text-foreground'
      } ${className}`.trim()}
    >
      {icon}
      {label}
    </button>
  );
}

export default FilterChip;
