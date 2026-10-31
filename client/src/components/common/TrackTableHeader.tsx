import React from 'react';
import { Heart, Ban, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface TrackTableHeaderProps {
  showActions?: boolean;
  className?: string;
}

export const TrackTableHeader: React.FC<TrackTableHeaderProps> = ({
  showActions = true,
  className = ''
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`hidden md:flex px-4 py-2 text-xs font-semibold tracking-widest text-secondary border-b border-white/10 uppercase mb-2 ${className}`}
    >
      <div className="w-12 text-center">#</div>
      <div className="flex-1">{t('views.title', 'Title')}</div>
      {showActions && (
        <div className="w-24 flex justify-center gap-4">
          <Heart size={14} />
          <Ban size={14} />
        </div>
      )}
      <div className="w-16 text-right">
        <Clock size={14} className="inline-block" />
      </div>
    </div>
  );
};

export default TrackTableHeader;
