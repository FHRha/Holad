import { useTranslation } from 'react-i18next';
import { Music, Radio } from 'lucide-react';

export interface FriendListItemProps {
  friend: {
    user_id?: string;
    id?: string;
    username: string;
    tag: string;
    isOnline?: boolean;
    nowPlaying?: {
      title?: string;
      artist?: string;
    } | null;
  };
  isInJam: boolean;
  canInviteToJam: boolean;
  onInviteToJam: () => void;
  variant?: 'sidebar' | 'view' | 'modal';
}

export default function FriendListItem({
  friend,
  isInJam,
  canInviteToJam,
  onInviteToJam,
  variant = 'view',
}: FriendListItemProps) {
  const { t } = useTranslation();
  const firstLetter = (friend.username?.charAt(0) || 'U').toUpperCase();

  if (variant === 'sidebar') {
    return (
      <div className="bg-neutral-100 dark:bg-[#141414] hover:bg-neutral-200/60 dark:hover:bg-[#181818] rounded-xl p-2.5 transition-all flex items-center justify-between gap-2.5 group">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center ring-1 ring-primary/25">
              {firstLetter}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-neutral-100 dark:ring-[#141414] ${
                friend.isOnline ? 'bg-green-500' : 'bg-secondary/40'
              }`}
              title={friend.isOnline ? t('social.status_online') : t('social.status_offline')}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="font-semibold text-xs text-foreground truncate">{friend.username}</span>
              <span className="text-[10px] text-secondary font-mono">#{friend.tag}</span>
            </div>
            {friend.isOnline && friend.nowPlaying ? (
              <p className="text-[11px] text-primary truncate flex items-center gap-1 font-medium mt-0.5">
                <Music size={11} className="shrink-0 animate-pulse" />
                <span className="truncate">
                  {friend.nowPlaying.title}{friend.nowPlaying.artist ? ` • ${friend.nowPlaying.artist}` : ''}
                </span>
              </p>
            ) : (
              <p className="text-[10px] text-secondary mt-0.5">
                {friend.isOnline ? t('social.status_online') : t('social.status_offline')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canInviteToJam && !isInJam && (
            <button
              onClick={onInviteToJam}
              className="p-1.5 px-2.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-lg transition-colors text-xs font-semibold flex items-center gap-1"
              title={t('social.invite_to_jam')}
            >
              <Radio size={13} />
              <span className="hidden xl:inline text-[11px]">{t('social.invite_to_jam')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="bg-[#1e1e1e] border border-white/5 hover:border-white/10 rounded-2xl p-3 transition-all flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center ring-1 ring-primary/30">
              {firstLetter}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#1e1e1e] ${
                friend.isOnline ? 'bg-green-500' : 'bg-secondary/40'
              }`}
              title={friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-sm text-foreground truncate">{friend.username}</span>
              <span className="text-[11px] text-secondary font-mono">#{friend.tag}</span>
            </div>
            {friend.isOnline && friend.nowPlaying ? (
              <p className="text-[11px] text-primary truncate flex items-center gap-1 font-medium mt-0.5">
                <Music size={11} className="shrink-0 animate-pulse" />
                <span className="truncate">
                  {friend.nowPlaying.title}{friend.nowPlaying.artist ? ` • ${friend.nowPlaying.artist}` : ''}
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-secondary mt-0.5">
                {friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canInviteToJam && !isInJam && (
            <button
              onClick={onInviteToJam}
              className="p-2 px-3 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl transition-colors text-xs font-bold flex items-center gap-1 active:scale-95"
              title={t('social.invite_to_jam', 'Позвать в Jam')}
            >
              <Radio size={14} />
              <span>{t('social.invite_to_jam', 'Позвать')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // variant === 'view'
  return (
    <div className="bg-card border border-border hover:border-foreground/20 rounded-2xl p-3.5 transition-all flex items-center justify-between gap-3 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center ring-1 ring-primary/30">
            {firstLetter}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-card ${
              friend.isOnline ? 'bg-green-500' : 'bg-secondary/40'
            }`}
            title={friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-sm text-foreground truncate">{friend.username}</span>
            <span className="text-xs text-secondary font-mono">#{friend.tag}</span>
          </div>
          {friend.isOnline && friend.nowPlaying ? (
            <p className="text-xs text-primary truncate flex items-center gap-1 font-semibold mt-0.5">
              <Music size={12} className="shrink-0 animate-pulse" />
              <span className="truncate">
                {friend.nowPlaying.title}{friend.nowPlaying.artist ? ` • ${friend.nowPlaying.artist}` : ''}
              </span>
            </p>
          ) : (
            <p className="text-xs text-secondary mt-0.5">
              {friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canInviteToJam && !isInJam && (
          <button
            onClick={onInviteToJam}
            className="p-2 px-3.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl transition-colors text-xs font-bold flex items-center gap-1.5 active:scale-95"
            title={t('social.invite_to_jam', 'Позвать в Jam')}
          >
            <Radio size={14} />
            <span>{t('social.invite_to_jam', 'Позвать')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
