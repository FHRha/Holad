import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface RatingStarsProps {
  rating: number;
  onRate: (val: number) => void;
  variant?: 'desktop' | 'mobile';
}

export function RatingStars({ rating, onRate, variant = 'desktop' }: RatingStarsProps) {
  const { t } = useTranslation();

  if (variant === 'mobile') {
    return (
      <div className="bg-foreground/5 rounded-2xl p-4 flex flex-col items-center gap-2">
        <span className="text-xs text-secondary font-medium">{t('common.rate')}</span>
        <div className="flex gap-2 text-yellow-400">
          {[1, 2, 3, 4, 5].map(v => (
            <Star 
              key={v} 
              size={24} 
              fill={v <= rating ? 'currentColor' : 'transparent'} 
              className={`active:scale-125 transition-transform ${v > rating ? 'text-foreground/30' : ''}`}
              onClick={(e) => { e.stopPropagation(); onRate(v); }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 hover:bg-foreground/10 transition-colors cursor-default">
      <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
        <Star size={16} />
        <span>{t('common.rate')}</span>
      </div>
      <div className="flex gap-1 text-yellow-400">
        {[1, 2, 3, 4, 5].map(v => (
          <Star 
            key={v} 
            size={14} 
            fill={v <= rating ? 'currentColor' : 'transparent'} 
            className={`cursor-pointer hover:scale-125 transition-transform ${v > rating ? 'text-foreground/30' : ''}`}
            onClick={(e) => { e.stopPropagation(); onRate(v); }}
          />
        ))}
      </div>
    </div>
  );
}
