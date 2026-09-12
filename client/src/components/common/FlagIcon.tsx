interface FlagIconProps {
  code: 'ru' | 'en' | 'us' | string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function FlagIcon({ code, className = '', size = 'md' }: FlagIconProps) {
  const normalizedCode = code.toLowerCase();

  const sizeClasses = {
    sm: 'w-4 h-3',
    md: 'w-5 h-3.5',
    lg: 'w-6 h-4.5',
  }[size] || 'w-5 h-3.5';

  if (normalizedCode === 'ru') {
    return (
      <span
        className={`inline-block overflow-hidden rounded-[3px] shadow-xs shrink-0 ring-1 ring-black/15 dark:ring-white/10 ${sizeClasses} ${className}`}
        title="Русский"
      >
        <svg
          viewBox="0 0 640 480"
          className="w-full h-full block"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g fillRule="evenodd" strokeWidth="1pt">
            <path fill="#ffffff" d="M0 0h640v160H0z" />
            <path fill="#0039a6" d="M0 160h640v160H0z" />
            <path fill="#d52b1e" d="M0 320h640v160H0z" />
          </g>
        </svg>
      </span>
    );
  }

  if (normalizedCode === 'en' || normalizedCode === 'us') {
    return (
      <span
        className={`inline-block overflow-hidden rounded-[3px] shadow-xs shrink-0 ring-1 ring-black/15 dark:ring-white/10 ${sizeClasses} ${className}`}
        title="English"
      >
        <svg
          viewBox="0 0 640 480"
          className="w-full h-full block"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 13 stripes */}
          <path fill="#bd3d44" d="M0 0h640v480H0z" />
          <path
            stroke="#ffffff"
            strokeWidth="37"
            d="M0 55.5h640M0 129.5h640M0 203.5h640M0 277.5h640M0 351.5h640M0 425.5h640"
          />
          {/* Blue canton */}
          <path fill="#192f5d" d="M0 0h260v259H0z" />
          {/* Star pattern */}
          <g fill="#ffffff">
            <g id="us-s">
              <g id="us-sx">
                <path
                  id="us-star"
                  d="m26 18 3.5 10.7H40.7L32 35.3l3.3 10.4-8.7-6.3-8.7 6.3 3.3-10.4-8.7-6.6h11.2z"
                  transform="scale(.7)"
                />
                <use href="#us-star" x="40" />
                <use href="#us-star" x="80" />
                <use href="#us-star" x="120" />
                <use href="#us-star" x="160" />
                <use href="#us-star" x="200" />
              </g>
              <use href="#us-sx" x="20" y="24" />
            </g>
            <use href="#us-s" y="48" />
            <use href="#us-s" y="96" />
            <use href="#us-s" y="144" />
            <use href="#us-sx" y="192" />
          </g>
        </svg>
      </span>
    );
  }

  return null;
}
