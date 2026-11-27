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
  className?: string;
}

export function CardGridSkeleton({
  count = 12,
  variant = 'square',
  viewMode = 'grid',
  className = '',
}: CardGridSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-3 p-2 rounded-xl bg-foreground/[0.03]">
            <Skeleton
              className={`w-12 h-12 shrink-0 ${variant === 'circle' ? 'rounded-full' : 'rounded-lg'}`}
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

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 ${className}`}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="flex flex-col gap-2.5 p-2 md:p-3 rounded-xl bg-foreground/[0.02]">
          <Skeleton
            className={`w-full aspect-square ${variant === 'circle' ? 'rounded-full' : 'rounded-xl'}`}
          />
          <Skeleton className={`h-4 w-3/4 ${variant === 'circle' ? 'mx-auto' : ''}`} />
          <Skeleton className={`h-3 w-1/2 ${variant === 'circle' ? 'mx-auto' : ''}`} />
        </div>
      ))}
    </div>
  );
}

interface TrackListSkeletonProps {
  count?: number;
  compact?: boolean;
  className?: string;
}

export function TrackListSkeleton({
  count = 10,
  compact = false,
  className = '',
}: TrackListSkeletonProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-3 px-2 sm:px-4 ${compact ? 'py-2' : 'py-2.5'} rounded-lg`}
        >
          <Skeleton className="w-6 h-4 shrink-0 hidden sm:block" />
          <Skeleton className="w-10 h-10 rounded-md shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-48 max-w-[75%]" />
            <Skeleton className="h-3 w-32 max-w-[50%]" />
          </div>
          {!compact && <Skeleton className="h-3.5 w-28 hidden md:block shrink-0" />}
          <Skeleton className="h-3.5 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

interface DetailHeaderSkeletonProps {
  avatarShape?: 'square' | 'circle';
  className?: string;
}

export function DetailHeaderSkeleton({
  avatarShape = 'square',
  className = '',
}: DetailHeaderSkeletonProps) {
  return (
    <div
      className={`flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-end text-center md:text-left ${className}`}
    >
      <Skeleton
        className={`w-44 h-44 md:w-64 md:h-64 shrink-0 ${
          avatarShape === 'circle' ? 'rounded-full' : 'rounded-xl'
        }`}
      />
      <div className="flex flex-col gap-3 flex-1 w-full items-center md:items-start">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-10 md:h-14 w-64 md:w-96 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-[80%]" />
        <Skeleton className="h-5 w-36" />
        <div className="flex items-center gap-3 mt-2">
          <Skeleton className="w-14 h-14 md:w-32 md:h-11 rounded-full" />
          <Skeleton className="hidden md:block w-32 h-11 rounded-full" />
          <Skeleton className="hidden md:block w-32 h-11 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function HomeSectionSkeleton({ isMobile = false }: { isMobile?: boolean }) {
  if (isMobile) {
    return (
      <div className="flex flex-1 flex-col bg-transparent overflow-y-auto px-4 pt-[calc(1rem+var(--safe-area-inset-top))] pb-[calc(8rem+var(--safe-area-inset-bottom))] gap-8">
        <div className="flex items-center gap-3">
          <Skeleton className="flex-1 h-11 rounded-xl" />
          <Skeleton className="w-11 h-11 rounded-full shrink-0" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-44" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-36" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-28 rounded-full shrink-0" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-40" />
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
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar pt-10 gap-10">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-52" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2.5">
              <Skeleton className="w-full aspect-square rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-44" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-36 rounded-xl shrink-0" />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2.5">
              <Skeleton className="w-full aspect-square rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
