import type { ReactNode } from 'react';

export interface SettingSectionProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  isMobile?: boolean;
}

export default function SettingSection({
  title,
  children,
  className = '',
  isMobile = false,
}: SettingSectionProps) {
  if (isMobile) {
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">
          {title}
        </span>
        <div className="bg-black/20 p-4 rounded-xl flex flex-col gap-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">{title}</h4>
      <div className="bg-black/[0.02] dark:bg-black/25 p-4 rounded-xl border border-black/10 dark:border-black/50">
        {children}
      </div>
    </div>
  );
}
