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
import BottomSheet from '../BottomSheet';
import { MobileIconBtn } from './MenuButtons';
import { RatingStars } from './RatingStars';
import { useTrackActions } from './useTrackActions';
import { useContextMenuPlaylists } from './useContextMenuPlaylists';

export function MobileContextMenuDrawer() {
  const { t } = useTranslation();
  const { isOpen, item, type, closeMenu } = useContextMenuStore();

  const actions = useTrackActions({ item, type, closeMenu, isOpen });
  const playlistsState = useContextMenuPlaylists({
    isOpen,
    item,
    isAlbum: actions.isAlbum,
    getTracks: actions.getTracks,
    closeMenu
  });

  if (!isOpen || !item) return null;

  return (
    <>
      <AddToPlaylistModal 
        isOpen={playlistsState.isPlaylistModalOpen} 
        onClose={playlistsState.handleClosePlaylistModal}
        trackIds={playlistsState.modalTrackIds}
      />
      <BottomSheet
        isOpen={isOpen}
        onClose={closeMenu}
        header={
          <div className="flex items-center gap-3">
            <img 
              src={getCoverArtUrl(item?.coverArt || item?.albumId || item?.id, 300)} 
              alt="" 
              className="w-12 h-12 rounded object-cover shadow-md pointer-events-none" 
            />
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-foreground text-[15px] truncate">{item.title || item.name}</span>
              <span className="text-secondary text-xs truncate">{item.artist}</span>
            </div>
          </div>
        }
      >
        <div className="overflow-y-auto hide-scrollbar max-h-[60vh] px-2 py-4 space-y-4">
          {playlistsState.showPlaylists ? (
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => playlistsState.setShowPlaylists(false)} 
                className="text-secondary text-sm font-semibold mb-2 self-start flex items-center"
              >
                <ChevronRight size={16} className="rotate-180 mr-1" />
                {t('common.add_to_playlist')}
              </button>
              {playlistsState.playlists.slice(0, 5).map(p => {
                const coverUrl = getCoverArtUrl(p.coverArt, 100);
                return (
                  <button 
                    key={p.id}
                    onClick={() => playlistsState.handleAddToPlaylist(p.id)}
                    className="flex items-center gap-3 p-2 hover:bg-foreground/5 rounded-xl transition-colors text-left"
                  >
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="w-10 h-10 rounded object-cover shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-foreground/5 flex items-center justify-center text-secondary">
                        <ListMusic size={18} />
                      </div>
                    )}
                    <span className="text-sm font-semibold text-foreground truncate flex-1">{p.name}</span>
                  </button>
                );
              })}
              {playlistsState.playlists.length === 0 && (
                <div className="text-secondary text-sm text-center py-4">{t('common.no_playlists_found')}</div>
              )}
              
              <form onSubmit={playlistsState.handleCreatePlaylistInline} className="flex gap-2 mt-2">
                <input 
                  type="text" 
                  placeholder={t('common.new_playlist')} 
                  value={playlistsState.newPlaylistName}
                  onChange={(e) => playlistsState.setNewPlaylistName(e.target.value)}
                  className="flex-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-secondary focus:outline-none focus:border-primary/50 transition-colors"
                />
                <button 
                  type="submit"
                  disabled={!playlistsState.newPlaylistName.trim()}
                  className="px-4 py-2.5 bg-foreground/10 text-foreground font-semibold rounded-xl disabled:opacity-50 hover:bg-white/20 transition-colors"
                >
                  <Plus size={18} />
                </button>
              </form>

              {playlistsState.playlists.length > 0 && (
                <button 
                  onClick={playlistsState.handleOpenPlaylistModal} 
                  className="w-full py-3 mt-2 bg-foreground/5 hover:bg-foreground/10 text-foreground text-sm font-semibold rounded-xl transition-colors"
                >
                  {t('common.show_all_playlists')}
                </button>
              )}
            </div>
          ) : type !== 'playlist' ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                <MobileIconBtn icon={Play} label={t('common.play_now')} onClick={() => actions.handleAction(actions.onPlayNow)} />
                <MobileIconBtn 
                  icon={ListPlus} 
                  label={actions.isJamActive ? t('common.play_next_jam') : t('common.play_next')} 
                  onClick={() => actions.handleAction(actions.onPlayNext)} 
                  activeColor={actions.isJamActive ? "text-primary" : ""}
                  color={actions.isJamActive ? "text-primary font-semibold" : "text-foreground"}
                />
                {!actions.isInQueue && (
                  <MobileIconBtn 
                    icon={SkipForward} 
                    label={actions.isJamActive ? t('common.add_to_jam_queue') : t('common.add_to_queue')} 
                    onClick={() => actions.handleAction(actions.onAddToQueue)} 
                    activeColor={actions.isJamActive ? "text-primary" : ""}
                    color={actions.isJamActive ? "text-primary font-semibold" : "text-foreground"}
                  />
                )}
                {!actions.isGuest && (item.playlistId ? (
                  <MobileIconBtn icon={ListMinus} label={t('common.remove_from_playlist')} onClick={actions.handleRemoveFromPlaylist} color="text-red-500" />
                ) : (
                  <MobileIconBtn icon={ListMusic} label={t('common.add_to_playlist')} onClick={playlistsState.onShowPlaylists} />
                ))}
                {!actions.isGuest && <MobileIconBtn icon={Heart} label={t('common.favorite')} onClick={() => actions.handleAction(actions.onLike)} activeColor={actions.isLiked ? "text-primary" : "text-foreground"} />}
                {!actions.isGuest && <MobileIconBtn icon={Ban} label={t('common.ignore')} onClick={() => actions.handleAction(actions.onExclude)} activeColor={actions.isExcluded ? "text-red-500" : "text-foreground"} />}
                {!actions.isGuest && (actions.isDownloaded ? (
                  <MobileIconBtn icon={Trash2} color="text-primary" label={t('common.remove_download')} onClick={() => actions.handleAction(actions.onRemoveDownload)} />
                ) : (
                  <MobileIconBtn icon={Download} label={t('common.download')} onClick={() => actions.handleAction(actions.onDownload)} />
                ))}
                {!actions.isGuest && <MobileIconBtn icon={Share2} label={t('common.share')} onClick={() => actions.handleAction(actions.onShare, false)} activeColor={actions.isCopied ? "text-primary" : "text-foreground"} />}
                {!actions.isGuest && item.artistId && <MobileIconBtn icon={User} label={t('common.go_to_artist')} onClick={() => actions.handleAction(() => actions.navigate(`/artist/${item.artistId}`))} />}
                {!actions.isGuest && (actions.isAlbum || item.albumId) && <MobileIconBtn icon={Disc} label={t('common.go_to_album')} onClick={() => actions.handleAction(() => {
                  if (actions.isAlbum) actions.navigate(`/album/${item.id}`);
                  else if (item.albumId) actions.navigate(`/album/${item.albumId}`);
                })} />}
                {item.queueIndex !== undefined && (
                  <MobileIconBtn icon={Trash2} label={t('common.remove_from_queue')} onClick={() => actions.handleAction(actions.onRemoveFromQueue)} color="text-red-400" />
                )}
              </div>

              {!actions.isGuest && (
                <RatingStars rating={actions.rating} onRate={actions.onRate} variant="mobile" />
              )}
            </>
          ) : null}

          {type === 'playlist' && (
            <div className="grid grid-cols-3 gap-2">
              <MobileIconBtn icon={Play} label={t('common.open')} onClick={() => actions.handleAction(() => { actions.navigate(`/playlist/${item.id}`); })} />
              <MobileIconBtn icon={Share2} label={actions.isCopied ? t('common.copied') : t('common.share')} onClick={() => actions.handleAction(() => actions.handleSharePlaylist(item), false)} activeColor={actions.isCopied ? "text-primary" : "text-foreground"} />
              <MobileIconBtn icon={Trash2} color="text-red-500" label={t('common.delete')} onClick={() => actions.handleDeletePlaylist(item)} />
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
export default MobileContextMenuDrawer;
