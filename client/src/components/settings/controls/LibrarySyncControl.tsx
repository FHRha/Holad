import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  RefreshCw,
  Music,
  Disc,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getLibrarySyncStatus,
  triggerLibrarySync,
  type LibrarySyncStatus,
} from '../../../api/library';

export interface LibrarySyncControlProps {
  isMobile?: boolean;
  className?: string;
}

export default function LibrarySyncControl({
  isMobile: _isMobile = false,
  className = '',
}: LibrarySyncControlProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LibrarySyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const fetchStatus = useCallback(async () => {
    try {
      const data = await getLibrarySyncStatus();
      setStatus(data);
      return data;
    } catch (err) {
      console.warn('[LibrarySyncControl] Failed to fetch sync status:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchStatus().finally(() => setIsLoading(false));
  }, [fetchStatus]);

  // Active polling while sync is running
  useEffect(() => {
    if (status?.is_syncing || status?.status === 'syncing') {
      pollTimerRef.current = setTimeout(async () => {
        const next = await fetchStatus();
        if (next && (next.is_syncing || next.status === 'syncing')) {
          // Continue polling every 2s
        }
      }, 2000);
    }

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [status?.is_syncing, status?.status, fetchStatus]);

  const handleSyncClick = async () => {
    if (isTriggering || status?.is_syncing) return;
    setIsTriggering(true);

    try {
      const result = await triggerLibrarySync();
      if (result.success) {
        toast.info(t('settings.library_sync_started', 'Синхронизация медиатеки запущена'));
        // Optimistically set syncing state
        setStatus((prev) =>
          prev
            ? { ...prev, is_syncing: true, status: 'syncing', progress: 5 }
            : {
                is_syncing: true,
                status: 'syncing',
                progress: 5,
                total_tracks: 0,
                total_albums: 0,
                total_artists: 0,
                last_sync_time: Date.now(),
                error: null,
              }
        );
        // Quick re-fetch after 500ms
        setTimeout(fetchStatus, 500);
      } else if (result.status === 429) {
        toast.warning(
          result.message ||
            t('settings.library_sync_cooldown', 'Подождите перед повторной синхронизацией')
        );
      } else if (result.status === 409) {
        toast.info(
          result.message ||
            t('settings.library_sync_already_running', 'Синхронизация уже выполняется')
        );
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          t('settings.library_sync_failed', 'Не удалось запустить синхронизацию')
      );
    } finally {
      setIsTriggering(false);
    }
  };

  const formatLastSync = (timestamp?: number): string => {
    if (!timestamp || timestamp <= 0) {
      return t('settings.never', 'Никогда');
    }
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 45) {
      return t('settings.just_now', 'только что');
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin} ${t('settings.min_ago', 'мин. назад')}`;
    }
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `${diffHours} ${t('settings.hours_ago', 'ч. назад')}`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ${t('settings.days_ago', 'дн. назад')}`;
  };

  const isSyncing = Boolean(status?.is_syncing || status?.status === 'syncing');

  return (
    <div
      className={`rounded-2xl border border-border bg-foreground/[0.03] p-4 flex flex-col gap-4 ${className}`}
    >
      {/* Header with Title and Status Badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary flex-shrink-0">
            <Database size={18} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground leading-relaxed break-words">
              {t('settings.media_engine_cache', 'Кэш медиатеки (Holad Media Engine)')}
            </span>
            <span className="text-xs text-secondary leading-relaxed break-words">
              {t(
                'settings.media_engine_cache_desc',
                'Быстрый серверный SQLite-кэш с полнотекстовым поиском FTS5'
              )}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex-shrink-0">
          {isSyncing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border border-blue-500/30 text-blue-500 dark:text-blue-400 bg-blue-500/10 animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              <span>
                {t('settings.syncing', 'Синхронизация...')}
                {typeof status?.progress === 'number' && status.progress > 0
                  ? ` (${status.progress}%)`
                  : ''}
              </span>
            </span>
          ) : status?.status === 'error' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border border-red-500/30 text-red-500 dark:text-red-400 bg-red-500/10">
              <AlertCircle size={12} />
              <span>{t('settings.sync_error', 'Ошибка')}</span>
            </span>
          ) : status?.status === 'completed' || (status?.total_tracks || 0) > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
              <CheckCircle2 size={12} />
              <span>{t('settings.synced', 'Синхронизировано')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border border-border bg-card text-secondary">
              <span>{t('settings.ready', 'Готово')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-foreground/[0.02] border border-border">
          <div className="flex items-center gap-1.5 text-secondary text-xs mb-1">
            <Music size={13} className="text-primary/80" />
            <span>{t('sidebar.tracks', 'Треки')}</span>
          </div>
          <span className="text-base font-bold text-foreground font-mono">
            {isLoading ? '...' : (status?.total_tracks ?? 0).toLocaleString()}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-foreground/[0.02] border border-border">
          <div className="flex items-center gap-1.5 text-secondary text-xs mb-1">
            <Disc size={13} className="text-primary/80" />
            <span>{t('sidebar.albums', 'Альбомы')}</span>
          </div>
          <span className="text-base font-bold text-foreground font-mono">
            {isLoading ? '...' : (status?.total_albums ?? 0).toLocaleString()}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-foreground/[0.02] border border-border">
          <div className="flex items-center gap-1.5 text-secondary text-xs mb-1">
            <Users size={13} className="text-primary/80" />
            <span>{t('sidebar.artists', 'Артисты')}</span>
          </div>
          <span className="text-base font-bold text-foreground font-mono">
            {isLoading ? '...' : (status?.total_artists ?? 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Footer with Last Sync Timestamp & Trigger Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border">
        <div className="text-xs text-secondary flex items-center gap-1">
          <span>{t('settings.last_sync', 'Последняя синхронизация:')}</span>
          <span className="font-medium text-foreground">
            {formatLastSync(status?.last_sync_time)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleSyncClick}
          disabled={isSyncing || isTriggering}
          aria-label={t('settings.sync_now', 'Синхронизировать сейчас')}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-[36px] rounded-xl text-xs font-semibold bg-primary text-black hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
        >
          {isSyncing || isTriggering ? (
            <>
              <Loader2 size={14} className="animate-spin text-black" />
              <span>{t('settings.syncing_button', 'Синхронизация...')}</span>
            </>
          ) : (
            <>
              <RefreshCw size={14} className="text-black" />
              <span>{t('settings.sync_now', 'Синхронизировать сейчас')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
