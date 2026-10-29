import type { ReactNode } from 'react';

export interface SettingSectionProps {
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  isMobile?: boolean;
}

export default function SettingSection({
  title,
  icon,
  description,
  children,
  className = '',
  isMobile = false,
}: SettingSectionProps) {
  const header = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-primary flex-shrink-0">{icon}</span>}
        {typeof title === 'string' ? (
          <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider">
            {title}
          </h4>
        ) : (
          <div className="text-xs font-semibold text-secondary uppercase tracking-wider">
            {title}
          </div>
        )}
      </div>
      {description && (
        <p className="text-xs text-secondary/80 leading-relaxed pl-0">
          {description}
        </p>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className={`flex flex-col gap-2.5 ${className}`}>
        {header}
        <div className="bg-card border border-border shadow-sm rounded-2xl p-4 flex flex-col gap-3.5">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {header}
      <div className="bg-card border border-border shadow-sm rounded-2xl p-5">
        {children}
      </div>
    </div>
  );
}
