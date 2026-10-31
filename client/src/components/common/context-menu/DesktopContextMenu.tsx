import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Play,
  ListPlus,
  ListMinus,
  SkipForward,
  Trash2,
  Heart,
  Download,
  Share2,
  User,
  Disc,
  Ban,
  ListMusic,
  Plus,
  ChevronRight
} from 'lucide-react';
import { useContextMenuStore } from '../../../store/contextMenuStore';
import { getCoverArtUrl } from '../../../api/subsonic';
import AddToPlaylistModal from '../AddToPlaylistModal';
import { ItemBtn } from './MenuButtons';
import { RatingStars } from './RatingStars';
import { useTrackActions } from './useTrackActions';
import { useContextMenuPlaylists } from './useContextMenuPlaylists';

export function DesktopContextMenu() {
  const { t } = useTranslation();
  const { isOpen, x, y, item, type, closeMenu } = useContextMenuStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const actions = useTrackActions({ item, type, closeMenu, isOpen });
  const playlistsState = useContextMenuPlaylists({
    isOpen,
    item,
    isAlbum: actions.isAlbum,
    getTracks: actions.getTracks,
    closeMenu
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, closeMenu]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => closeMenu();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isOpen, closeMenu]);

  if (typeof document === 'undefined' || !isOpen || !item) return null;

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  const safeX = typeof x === 'number' && !isNaN(x) ? x : winWidth / 2;
  const safeY = typeof y === 'number' && !isNaN(y) ? y : winHeight / 2;
  const left = Math.max(8, Math.min(safeX, winWidth - 230));
  const top = Math.max(8, Math.min(safeY, winHeight - 50));
  const transform = safeY > winHeight / 2 ? 'translateY(-100%)' : 'none';

  return createPortal(
    <>
      <AddToPlaylistModal 
        isOpen={playlistsState.isPlaylistModalOpen} 
        onClose={playlistsState.handleClosePlaylistModal}
        trackIds={playlistsState.modalTrackIds}
      />
      <div 
        className="fixed inset-0 z-[9998] bg-transparent"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeMenu();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeMenu();
        }}
      />
      <div 
        ref={menuRef}
        className="fixed z-[9999] bg-card border border-border rounded-lg shadow-2xl overflow-y-auto hide-scrollbar py-1 min-w-[220px] transform-gpu"
        style={{ 
          top, 
          left,
          transform,
          maxHeight: '85vh'
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <img 
            src={getCoverArtUrl(item.coverArt || item.albumId || item.id, 300)} 
            alt="" 
            className="w-10 h-10 rounded object-cover shadow-md" 
          />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-foreground text-sm truncate">{item.title || item.name}</span>
            <span className="text-secondary text-xs truncate">{item.artist}</span>
          </div>
        </div>

        {playlistsState.showPlaylists ? (
          <div className="py-2 px-1 flex flex-col w-[240px]">
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); playlistsState.setShowPlaylists(false); }} 
              className="text-secondary text-xs font-semibold mb-2 px-3 flex items-center hover:text-foreground"
            >
              <ChevronRight size={14} className="rotate-180 mr-1" />
              {t('common.add_to_playlist')}
            </button>
            
            {playlistsState.playlists.slice(0, 5).map(p => {
              const coverUrl = getCoverArtUrl(p.coverArt, 100);
              return (
                <button 
                  key={p.id}
                  onClick={() => playlistsState.handleAddToPlaylist(p.id)}
                  className="flex items-center gap-3 p-2 mx-1 hover:bg-foreground/5 rounded-lg transition-colors text-left"
                >
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="w-8 h-8 rounded object-cover shadow-sm" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-foreground/5 flex items-center justify-center text-secondary">
                      <ListMusic size={14} />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-foreground truncate flex-1">{p.name}</span>
                </button>
              );
            })}
            {playlistsState.playlists.length === 0 && (
              <div className="text-secondary text-xs text-center py-4">{t('common.no_playlists_found')}</div>
            )}
            
            <form onSubmit={playlistsState.handleCreatePlaylistInline} className="flex gap-2 mt-2 px-2">
              <input 
                type="text" 
                placeholder={t('common.new_playlist')} 
                value={playlistsState.newPlaylistName}
                onChange={(e) => playlistsState.setNewPlaylistName(e.target.value)}
                className="flex-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-secondary focus:outline-none focus:border-primary/50 transition-colors min-w-0"
              />
              <button 
                type="submit"
                disabled={!playlistsState.newPlaylistName.trim()}
                className="px-3 py-1.5 bg-foreground/10 text-foreground font-semibold rounded-lg disabled:opacity-50 hover:bg-white/20 transition-colors"
              >
                <Plus size={14} />
              </button>
            </form>

            {playlistsState.playlists.length > 0 && (
              <button onClick={playlistsState.handleOpenPlaylistModal} className="w-[calc(100%-16px)] mx-2 py-2 mt-2 bg-foreground/5 hover:bg-foreground/10 text-foreground text-xs font-semibold rounded-lg transition-colors">
                {t('common.show_all_playlists')}
              </button>
            )}
          </div>
        ) : type !== 'playlist' ? (
          <>
            <div className="py-1">
              <ItemBtn icon={Play} label={t('common.play_now')} onClick={() => actions.handleAction(actions.onPlayNow)} />
              <ItemBtn 
                icon={ListPlus} 
                label={actions.isJamActive ? t('common.play_next_jam') : t('common.play_next')} 
                onClick={() => actions.handleAction(actions.onPlayNext)} 
                color={actions.isJamActive ? "text-primary font-bold" : "text-foreground"} 
              />
              {!actions.isInQueue && (
                <ItemBtn 
                  icon={SkipForward} 
                  label={actions.isJamActive ? t('common.add_to_jam_queue') : t('common.add_to_queue')} 
                  onClick={() => actions.handleAction(actions.onAddToQueue)} 
                  color={actions.isJamActive ? "text-primary font-bold" : "text-foreground"} 
                />
              )}
              {!actions.isGuest && (item.playlistId ? (
                <ItemBtn icon={ListMinus} label={t('common.remove_from_playlist')} onClick={actions.handleRemoveFromPlaylist} color="text-red-500 hover:text-red-400" />
              ) : (
                <ItemBtn icon={ListMusic} label={t('common.add_to_playlist')} onClick={playlistsState.onShowPlaylists} />
              ))}
            </div>

            {item.queueIndex !== undefined && (
              <div className="py-1 border-t border-border">
                <ItemBtn icon={Trash2} label={t('common.remove_from_queue')} onClick={() => actions.handleAction(actions.onRemoveFromQueue)} color="text-red-400 hover:text-red-300" />
              </div>
            )}

            {!actions.isGuest && (
              <>
                <div className="py-1 border-t border-border">
                  <ItemBtn 
                    icon={Heart} 
                    label={actions.isLiked ? t('common.remove_from_favs') : t('common.favorite')} 
                    onClick={() => actions.handleAction(actions.onLike)} 
                    color={actions.isLiked ? "text-primary" : "text-foreground"} 
                  />
                  <ItemBtn 
                    icon={Ban} 
                    label={actions.isExcluded ? t('common.unignore') : t('common.ignore')} 
                    onClick={() => actions.handleAction(actions.onExclude)} 
                    color={actions.isExcluded ? "text-red-500" : "text-foreground"} 
                  />
                  
                  <RatingStars rating={actions.rating} onRate={actions.onRate} variant="desktop" />
                </div>

                <div className="py-1 border-t border-border">
                  {actions.isDownloaded ? (
                    <ItemBtn icon={Trash2} color="text-primary font-bold" label={t('common.remove_download')} onClick={() => actions.handleAction(actions.onRemoveDownload)} />
                  ) : (
                    <ItemBtn icon={Download} label={t('common.download')} onClick={() => actions.handleAction(actions.onDownload)} />
                  )}
                  <ItemBtn 
                    icon={Share2} 
                    label={actions.isCopied ? t('common.copied') : t('common.share')} 
                    onClick={() => actions.handleAction(actions.onShare, false)} 
                    color={actions.isCopied ? "text-primary font-bold" : "text-foreground"}
                  />
                </div>

                <div className="py-1 border-t border-border">
                  {item.artistId && (
                    <ItemBtn icon={User} label={t('common.go_to_artist')} onClick={() => actions.handleAction(() => {
                      actions.navigate(`/artist/${item.artistId}`);
                    })} />
                  )}
                  <ItemBtn icon={Disc} label={t('common.go_to_album')} onClick={() => actions.handleAction(() => {
                    if (actions.isAlbum) actions.navigate(`/album/${item.id}`);
                    else if (item.albumId) actions.navigate(`/album/${item.albumId}`);
                  })} />
                </div>
              </>
            )}
          </>
        ) : null}

        {type === 'playlist' && (
          <div className="py-1">
            <ItemBtn icon={Play} label={t('common.open')} onClick={() => actions.handleAction(() => { actions.navigate(`/playlist/${item.id}`); })} />
            <ItemBtn icon={Share2} label={actions.isCopied ? t('common.copied') : t('common.share')} onClick={() => actions.handleAction(() => actions.handleSharePlaylist(item), false)} color={actions.isCopied ? "text-primary font-bold" : "text-foreground"} />
            <div className="py-1 border-t border-border">
              <ItemBtn icon={Trash2} label={t('common.delete')} onClick={() => actions.handleDeletePlaylist(item)} color="text-red-500 hover:text-red-400" />
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
export default DesktopContextMenu;
