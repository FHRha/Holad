import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';

export interface FriendRequest {
  fromUserId?: string;
  fromUsername?: string;
  fromTag?: string;
}

export interface OutgoingFriendRequest {
  toUserId?: string;
  toUsername?: string;
  toTag?: string;
}

export interface FriendRequestListProps {
  incomingRequests?: FriendRequest[];
  outgoingRequests?: OutgoingFriendRequest[];
  onAccept?: (userId: string) => void;
  onDecline?: (userId: string) => void;
  variant?: 'sidebar' | 'view' | 'modal';
  type?: 'incoming' | 'outgoing' | 'both';
}

export default function FriendRequestList({
  incomingRequests = [],
  outgoingRequests = [],
  onAccept,
  onDecline,
  variant = 'view',
  type = 'both',
}: FriendRequestListProps) {
  const { t } = useTranslation();

  const showIncoming = (type === 'incoming' || type === 'both') && incomingRequests.length > 0;
  const showOutgoing = (type === 'outgoing' || type === 'both') && outgoingRequests.length > 0;

  if (!showIncoming && !showOutgoing) return null;

  return (
    <>
      {showIncoming && (
        variant === 'sidebar' ? (
          <div className="space-y-1.5 mt-3">
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                {t('social.friend_requests')}
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                {incomingRequests.length}
              </span>
            </div>
            {incomingRequests.map((req, idx) => {
              const reqId = req.fromUserId || String(idx);
              const reqName = req.fromUsername || 'User';
              const reqTag = req.fromTag ? `#${req.fromTag}` : '';
              return (
                <div
                  key={reqId}
                  className="bg-neutral-100 dark:bg-[#141414] rounded-xl p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-xs text-foreground truncate">{reqName}</div>
                    <div className="text-[10px] text-secondary font-mono truncate">{reqTag}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { if (req.fromUserId && onAccept) onAccept(req.fromUserId); }}
                      className="p-1.5 px-2 bg-primary text-black rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1 text-xs font-semibold"
                      title={t('social.accept')}
                    >
                      <Check size={13} />
                      <span>{t('social.accept')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (req.fromUserId && onDecline) onDecline(req.fromUserId); }}
                      className="p-1.5 bg-neutral-200 dark:bg-[#222222] hover:bg-neutral-300 dark:hover:bg-[#2a2a2a] text-foreground rounded-lg transition-colors"
                      title={t('social.decline')}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : variant === 'modal' ? (
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
              {t('social.incoming_requests', 'Входящие заявки')} ({incomingRequests.length})
            </span>
            <div className="space-y-1.5">
              {incomingRequests.map((req, idx) => (
                <div key={req.fromUserId || idx} className="p-3 bg-[#1e1e1e] border border-white/5 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                      {(req.fromUsername || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-xs text-foreground truncate">{req.fromUsername}</span>
                      <span className="text-[10px] text-secondary font-mono">#{req.fromTag}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAccept && onAccept(req.fromUserId || '')}
                      className="p-1.5 px-3 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1 active:scale-95"
                    >
                      <Check size={13} />
                      <span>{t('social.accept', 'Принять')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecline && onDecline(req.fromUserId || '')}
                      className="p-1.5 px-2.5 bg-[#2a2a2a] hover:bg-[#333333] text-secondary hover:text-foreground text-xs rounded-xl transition-colors"
                    >
                      {t('social.decline', 'Отклонить')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
              {t('social.incoming_requests', 'Входящие заявки')} ({incomingRequests.length})
            </span>
            <div className="space-y-2">
              {incomingRequests.map((req, idx) => (
                <div key={req.fromUserId || idx} className="p-3 bg-card border border-border rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                      {(req.fromUsername || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-sm text-foreground truncate">{req.fromUsername}</span>
                      <span className="text-xs text-secondary font-mono">#{req.fromTag}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAccept && onAccept(req.fromUserId || '')}
                      className="p-2 px-3.5 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 flex items-center gap-1.5 active:scale-95 shadow-sm"
                    >
                      <Check size={14} />
                      <span>{t('social.accept', 'Принять')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecline && onDecline(req.fromUserId || '')}
                      className="p-2 px-3 bg-foreground/10 hover:bg-foreground/15 text-secondary hover:text-foreground text-xs font-semibold rounded-xl transition-colors"
                    >
                      {t('social.decline', 'Отклонить')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {showOutgoing && (
        variant === 'modal' ? (
          <div className="space-y-2 pt-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
              {t('social.outgoing_requests', 'Исходящие заявки')} ({outgoingRequests.length})
            </span>
            <div className="space-y-1.5">
              {outgoingRequests.map((req, idx) => (
                <div key={req.toUserId || idx} className="p-2.5 px-3 bg-[#1e1e1e] border border-white/5 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-white/5 text-secondary font-bold flex items-center justify-center text-xs shrink-0">
                      {(req.toUsername || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-xs text-foreground truncate">{req.toUsername}</span>
                      <span className="text-[10px] text-secondary font-mono">#{req.toTag}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-secondary italic">
                    {t('social.sent_request', 'Запрос отправлен')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-3">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
              {t('social.outgoing_requests', 'Исходящие заявки')} ({outgoingRequests.length})
            </span>
            <div className="space-y-2">
              {outgoingRequests.map((req, idx) => (
                <div key={req.toUserId || idx} className="p-3 bg-card border border-border rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-foreground/5 text-secondary font-bold flex items-center justify-center text-xs shrink-0">
                      {(req.toUsername || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-sm text-foreground truncate">{req.toUsername}</span>
                      <span className="text-xs text-secondary font-mono">#{req.toTag}</span>
                    </div>
                  </div>
                  <span className="text-xs text-secondary italic">
                    {t('social.sent_request', 'Запрос отправлен')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </>
  );
}
