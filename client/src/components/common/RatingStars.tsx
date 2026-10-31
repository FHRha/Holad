import type { MouseEvent } from 'react';
import { Star } from 'lucide-react';

export interface RatingStarsProps {
  rating: number;
  maxStars?: number;
  onRate?: (rating: number) => void;
  interactive?: boolean;
  size?: number;
  className?: string;
  starClassName?: string;
  unfilledClassName?: string;
  asButton?: boolean;
  buttonClassName?: string | ((star: number, isFilled: boolean) => string);
  getStarAriaLabel?: (star: number, isFilled: boolean) => string;
  getStarTitle?: (star: number, isFilled: boolean) => string;
}

export function RatingStars({
  rating,
  maxStars = 5,
  onRate,
  interactive = Boolean(onRate),
  size = 14,
  className = '',
  starClassName = '',
  unfilledClassName = 'text-foreground/30',
  asButton = false,
  buttonClassName,
  getStarAriaLabel,
  getStarTitle,
}: RatingStarsProps) {
  const stars = Array.from({ length: maxStars }, (_, i) => i + 1);

  return (
    <div className={`flex items-center text-yellow-400 ${className}`.trim()}>
      {stars.map((starValue) => {
        const isFilled = starValue <= rating;
        const handleClick = (e: MouseEvent) => {
          e.stopPropagation();
          if (interactive && onRate) {
            onRate(starValue);
          }
        };

        const ariaLabel = getStarAriaLabel ? getStarAriaLabel(starValue, isFilled) : undefined;
        const title = getStarTitle ? getStarTitle(starValue, isFilled) : undefined;

        if (asButton) {
          const btnClass = typeof buttonClassName === 'function'
            ? buttonClassName(starValue, isFilled)
            : (buttonClassName || '');

          return (
            <button
              key={starValue}
              type="button"
              className={btnClass}
              onClick={handleClick}
              aria-label={ariaLabel}
              title={title}
              disabled={!interactive}
            >
              <Star
                size={size}
                strokeWidth={2}
                fill={isFilled ? 'currentColor' : 'none'}
                className={starClassName}
              />
            </button>
          );
        }

        return (
          <Star
            key={starValue}
            size={size}
            fill={isFilled ? 'currentColor' : 'transparent'}
            className={`${interactive ? 'cursor-pointer hover:scale-125 transition-transform' : ''} ${
              !isFilled ? unfilledClassName : ''
            } ${starClassName}`.trim()}
            onClick={interactive ? handleClick : undefined}
            aria-label={ariaLabel}
          />
        );
      })}
    </div>
  );
}

export default RatingStars;
