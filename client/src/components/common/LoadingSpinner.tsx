import React from 'react';
import { useTranslation } from 'react-i18next';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  fullScreen = false,
  className = ''
}) => {
  const { t } = useTranslation();
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-4',
    lg: 'w-12 h-12 border-4',
  }[size];

  const spinner = (
    <div
      className={`rounded-full border-primary border-t-transparent animate-spin ${sizeClasses} ${className}`}
      role="status"
      aria-label={t('common.loading', 'Загрузка...')}
    />
  );

  if (fullScreen) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
