import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  iconClassName?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = 'py-16 text-center',
  iconClassName = 'mb-4 text-secondary opacity-60 flex items-center justify-center'
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-4 ${className}`.trim()}>
      {icon && (
        <div className={iconClassName}>
          {icon}
        </div>
      )}
      {title && <p className="text-lg font-bold text-foreground mb-1">{title}</p>}
      {description && (
        <p className="text-sm text-secondary leading-relaxed max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
