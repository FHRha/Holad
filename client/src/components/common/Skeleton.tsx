interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-foreground/[0.06] rounded-md ${className}`}
    />
  );
}

interface CardGridSkeletonProps {
  count?: number;
  variant?: 'square' | 'circle';
  viewMode?: 'grid' | 'list';
  withAlphabetBar?: boolean;
  className?: string;
}

export function CardGridSkeleton({
  count = 12,
  variant = 'square',
  viewMode = 'grid',
  withAlphabetBar = false,
  className = '',
}: CardGridSkeletonProps) {
  const alphabetPadding = withAlphabetBar ? 'pr-6 md:pr-0' : '';

  if (viewMode === 'list') {
    return (
      <div className={`flex flex-col gap-4 ${alphabetPadding} ${className}`.trim()}>
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-4">
            <Skeleton
              className={`w-16 h-16 shrink-0 ${variant === 'circle' ? 'rounded-full' : 'rounded-md'}`}
            />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <Skeleton className="h-4 w-44 max-w-[70%]" />
              <Skeleton className="h-3 w-28 max-w-[45%]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'circle') {
    return (
      <div
        className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6 ${alphabetPadding} ${className}`.trim()}
      >
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="flex flex-col p-4 rounded-xl bg-card/60">
            <div className="aspect-square mb-4 mx-2">
              <Skeleton className="w-full h-full rounded-full" />
            </div>
            <div className="text-left mt-auto px-1 flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 ${alphabetPadding} ${className}`.trim()}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="flex flex-col p-4 rounded-xl bg-card/60">
          <Skeleton className="w-full aspect-square rounded-lg" />
          <div className="p-3 mt-auto flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface TrackListSkeletonProps {
  count?: number;
  compact?: boolean;
  variant?: 'tracks' | 'favorites' | 'album' | 'playlist' | 'artist';
  className?: string;
}

export function TrackListSkeleton({
  count = 10,
  compact = false,
  variant,
  className = '',
}: TrackListSkeletonProps) {
  const resolvedVariant = variant ?? (compact ? 'favorites' : 'tracks');

  if (resolvedVariant === 'artist') {
    return (
      <div className={`flex flex-col gap-1 ${className}`.trim()}>
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-4 p-2 sm:p-3 rounded-lg">
            <div className="w-6 flex justify-center shrink-0">
              <Skeleton className="w-4 h-4" />
            </div>
            <Skeleton className="w-11 h-11 rounded shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <Skeleton className="h-4 w-44 max-w-[75%]" />
              <Skeleton className="h-3 w-28 max-w-[50%]" />
            </div>
            <Skeleton className="w-10 h-3.5 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (resolvedVariant === 'album' || resolvedVariant === 'playlist') {
    return (
      <div className={`flex flex-col gap-1 ${className}`.trim()}>
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="flex items-center px-2 sm:px-4 py-2 sm:py-3 rounded-lg">
            <div className="w-8 sm:w-12 flex justify-center shrink-0">
              <Skeleton className="w-4 h-4" />
            </div>
            <div className="flex-1 flex flex-col min-w-0 pr-2 sm:pr-4 gap-1.5">
              <Skeleton className="h-4 w-48 max-w-[75%]" />
              <Skeleton className="h-3 w-32 max-w-[50%]" />
            </div>
            <div className="hidden md:flex w-16 justify-center gap-3 shrink-0">
              <Skeleton className="w-4 h-4 rounded-full" />
              <Skeleton className="w-4 h-4 rounded-full" />
            </div>
            <div className="w-12 flex justify-end shrink-0">
              <Skeleton className="w-9 h-3.5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (resolvedVariant === 'favorites') {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-3 md:gap-4 p-2 rounded-md">
            <Skeleton className="w-8 h-4 hidden md:block shrink-0" />
            <Skeleton className="w-12 h-12 md:w-10 md:h-10 rounded-md md:rounded shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <Skeleton className="h-4 w-48 max-w-[75%]" />
              <Skeleton className="h-3 w-36 max-w-[60%]" />
            </div>
            <div className="w-10 flex justify-end md:justify-center shrink-0">
              <Skeleton className="w-4 h-4 rounded-full" />
            </div>
            <Skeleton className="w-12 h-3.5 hidden md:block shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  // Default: 'tracks'
  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="flex items-center md:px-6 md:py-2 mb-3 md:mb-0">
          <div className="w-10 hidden md:flex justify-center shrink-0">
            <Skeleton className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 md:min-w-[200px] flex items-center gap-3 pr-2 md:pr-4">
            <Skeleton className="w-12 h-12 md:w-10 md:h-10 rounded-md md:rounded shrink-0" />
            <div className="flex flex-col min-w-0 flex-1 gap-1.5">
              <Skeleton className="h-4 w-48 max-w-[75%]" />
              <Skeleton className="h-3 w-36 max-w-[60%]" />
            </div>
          </div>
          <div className="w-16 hidden md:flex justify-center shrink-0">
            <Skeleton className="w-10 h-3.5" />
          </div>
          <div className="flex-1 min-w-[150px] hidden md:block pr-4">
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="w-32 hidden md:block pr-4">
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="w-16 hidden lg:flex justify-end pr-4 shrink-0">
            <Skeleton className="w-10 h-3.5" />
          </div>
          <div className="w-16 md:w-24 flex items-center justify-end md:justify-center gap-2 md:gap-4 md:ml-4 shrink-0">
            <Skeleton className="w-4 h-4 rounded-full" />
            <Skeleton className="w-4 h-4 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface DetailHeaderSkeletonProps {
  avatarShape?: 'square' | 'circle';
  actionsCount?: number;
  className?: string;
}

export function DetailHeaderSkeleton({
  avatarShape = 'square',
  actionsCount = 4,
  className = '',
}: DetailHeaderSkeletonProps) {
  return (
    <div
      className={`flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-end text-center md:text-left ${className}`.trim()}
    >
      <Skeleton
        className={`w-48 h-48 md:w-64 md:h-64 shrink-0 ${
          avatarShape === 'circle' ? 'rounded-full' : 'rounded-xl'
        }`}
      />
      <div className="flex flex-col gap-3 flex-1 w-full items-center md:items-start">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-10 md:h-14 w-64 md:w-96 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-[80%]" />
        <Skeleton className="h-5 w-36" />
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-2 w-full">
          <Skeleton className="w-14 h-14 md:w-32 md:h-11 rounded-full shrink-0" />
          {Array.from({ length: Math.max(0, actionsCount - 1) }).map((_, i) => (
            <Skeleton key={i} className="w-10 h-10 md:w-32 md:h-11 rounded-full shrink-0" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomeSectionSkeleton({ isMobile = false }: { isMobile?: boolean }) {
  if (isMobile) {
    return (
      <div className="flex flex-1 flex-col bg-transparent overflow-y-auto pb-[calc(8rem+var(--safe-area-inset-bottom))]">
        <div className="sticky top-0 bg-background/80 backdrop-blur-xl px-4 pt-[calc(1rem+var(--safe-area-inset-top))] pb-2 z-10">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="flex-1 h-11 rounded-xl" />
            <Skeleton className="w-11 h-11 rounded-full shrink-0" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </div>

        <div className="px-4 py-4 flex flex-col gap-8">
          {/* Listening History */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="w-6 h-6 rounded-md" />
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          </div>

          {/* On the wave */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="w-6 h-6 rounded-md" />
            </div>
            <div className="flex gap-3 overflow-hidden">
              <Skeleton className="h-11 w-32 rounded-full shrink-0" />
              <Skeleton className="h-11 w-28 rounded-full shrink-0" />
              <Skeleton className="h-11 w-24 rounded-full shrink-0" />
              <Skeleton className="h-11 w-32 rounded-full shrink-0" />
            </div>
          </div>

          {/* Recently Played */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-44" />
              <div className="flex items-center gap-3">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="w-6 h-6 rounded-md" />
              </div>
            </div>
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 w-36 shrink-0">
                  <Skeleton className="w-36 h-36 rounded-2xl" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>

          {/* Frequently Played */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-48" />
              <div className="flex items-center gap-3">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="w-6 h-6 rounded-md" />
              </div>
            </div>
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 w-36 shrink-0">
                  <Skeleton className="w-36 h-36 rounded-2xl" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar pt-10 gap-10">
      {/* Hero section ("Откройте новое") */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <div className="flex gap-2">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="w-[calc(25%-12px)] min-w-[240px] p-6 rounded-2xl bg-foreground/[0.04] shrink-0 flex flex-col"
            >
              <div className="mb-4 flex justify-center">
                <Skeleton className="h-5 w-3/4" />
              </div>
              <Skeleton className="w-full aspect-square rounded-xl mb-5 mx-2" />
              <div className="mt-auto flex flex-col items-center gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Genres section ("Жанры и настроения") */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-52" />
          <div className="flex gap-2">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="w-[calc(20%-13px)] min-w-[160px] h-[160px] rounded-xl p-4 flex flex-col justify-between bg-foreground/[0.04] shrink-0"
            >
              <Skeleton className="h-6 w-2/3" />
              <div className="flex justify-between items-end">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="w-10 h-10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Standard carousel ("Часто слушаемое") */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <div className="flex gap-2">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="w-[calc(20%-13px)] min-w-[180px] bg-card/60 rounded-xl p-4 shrink-0 flex flex-col"
            >
              <Skeleton className="w-full aspect-square rounded-lg" />
              <div className="p-3 mt-auto flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
