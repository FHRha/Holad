import { useTranslation } from 'react-i18next';
import { Radio, Music, Check } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';

export interface JamInvite {
  roomId: string;
  fromUser: string;
  fromTag?: string;
  track?: {
    id?: string;
    title?: string;
    coverArt?: string;
    albumId?: string;
  };
}

export interface JamInviteListProps {
  activeInvites: JamInvite[];
  onAccept: (roomId: string) => void;
  onDecline: (roomId: string) => void;
  variant?: 'sidebar' | 'view' | 'modal';
}

export default function JamInviteList({
  activeInvites,
  onAccept,
  onDecline,
  variant = 'view',
}: JamInviteListProps) {
  const { t } = useTranslation();

  if (!activeInvites || activeInvites.length === 0) return null;

  if (variant === 'sidebar') {
    return (
      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
          {t('deeplink.invite_title')}
        </span>
        {activeInvites.map((inv) => (
          <div key={inv.roomId} className="bg-neutral-100 dark:bg-[#141414] rounded-2xl p-3 shadow-md space-y-2.5">
            <div className="flex items-center gap-2.5">
              {inv.track?.coverArt ? (
                <img
                  src={getCoverArtUrl(inv.track.coverArt || inv.track.albumId || inv.track.id, 80)}
                  alt=""
                  className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 ring-1 ring-primary/30">
                  <Radio size={18} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-xs text-foreground truncate">
                  {inv.fromUser} <span className="text-secondary font-mono text-[10px]">#{inv.fromTag}</span>
                </div>
                <div className="text-[11px] text-secondary truncate">
                  {t('social.invited_to_jam_toast', { name: inv.fromUser })}
                </div>
                {inv.track?.title && (
                  <div className="text-[11px] text-primary truncate font-medium flex items-center gap-1 mt-0.5">
                    <Music size={11} className="shrink-0" />
                    <span className="truncate">{inv.track.title}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onAccept(inv.roomId)}
                className="flex-1 py-1.5 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                <Check size={13} />
                <span>{t('social.accept')}</span>
              </button>
              <button
                type="button"
                onClick={() => onDecline(inv.roomId)}
                className="flex-1 py-1.5 bg-neutral-200 dark:bg-[#202020] hover:bg-neutral-300 dark:hover:bg-[#282828] text-foreground font-semibold text-xs rounded-xl transition-colors"
              >
                {t('social.decline')}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary px-1 flex items-center gap-1">
          <Radio size={12} /> {t('deeplink.invite_title', 'Приглашение в Jam-сессию')}
        </span>
        {activeInvites.map((inv) => (
          <div key={inv.roomId} className="bg-[#1e1e1e] border border-primary/25 rounded-2xl p-3 shadow-md space-y-2.5">
            <div className="flex items-center gap-3">
              {inv.track?.coverArt ? (
                <img
                  src={getCoverArtUrl(inv.track.coverArt || inv.track.albumId || inv.track.id, 80)}
                  alt=""
                  className="w-11 h-11 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-white/10"
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 ring-1 ring-primary/30">
                  <Radio size={20} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-xs text-foreground truncate">
                  {inv.fromUser} <span className="text-secondary font-mono text-[10px]">#{inv.fromTag}</span>
                </div>
                <div className="text-[11px] text-secondary truncate">
                  {t('social.invited_to_jam_toast', { name: inv.fromUser })}
                </div>
                {inv.track?.title && (
                  <div className="text-[11px] text-primary truncate font-medium flex items-center gap-1 mt-0.5">
                    <Music size={11} className="shrink-0" />
                    <span className="truncate">{inv.track.title}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => onAccept(inv.roomId)}
                className="flex-1 py-2 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1 active:scale-95 shadow-md"
              >
                <Check size={14} />
                <span>{t('social.accept', 'Принять')}</span>
              </button>
              <button
                type="button"
                onClick={() => onDecline(inv.roomId)}
                className="flex-1 py-2 bg-[#2a2a2a] hover:bg-[#333333] text-foreground font-semibold text-xs rounded-xl transition-colors active:scale-95"
              >
                {t('social.decline', 'Отклонить')}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // variant === 'view'
  return (
    <div className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-wider text-primary px-1 flex items-center gap-1.5">
        <Radio size={14} /> {t('deeplink.invite_title', 'Приглашение в Jam-сессию')}
      </span>
      {activeInvites.map((inv) => (
        <div key={inv.roomId} className="bg-card border border-primary/30 rounded-2xl p-3.5 shadow-md space-y-3">
          <div className="flex items-center gap-3">
            {inv.track?.coverArt ? (
              <img
                src={getCoverArtUrl(inv.track.coverArt || inv.track.albumId || inv.track.id, 80)}
                alt=""
                className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-white/10"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 ring-1 ring-primary/30">
                <Radio size={22} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-foreground truncate">
                {inv.fromUser} <span className="text-secondary font-mono text-xs">#{inv.fromTag}</span>
              </div>
              <div className="text-xs text-secondary truncate">
                {t('social.invited_to_jam_toast', { name: inv.fromUser })}
              </div>
              {inv.track?.title && (
                <div className="text-xs text-primary truncate font-semibold flex items-center gap-1 mt-0.5">
                  <Music size={12} className="shrink-0" />
                  <span className="truncate">{inv.track.title}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAccept(inv.roomId)}
              className="flex-1 py-2 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 active:scale-95 shadow-md"
            >
              <Check size={15} />
              <span>{t('social.accept', 'Принять')}</span>
            </button>
            <button
              type="button"
              onClick={() => onDecline(inv.roomId)}
              className="flex-1 py-2 bg-foreground/10 hover:bg-foreground/15 text-foreground font-semibold text-xs rounded-xl transition-colors active:scale-95"
            >
              {t('social.decline', 'Отклонить')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
