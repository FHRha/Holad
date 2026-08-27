import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Heart, MoreHorizontal, Clock, ArrowLeft, Download, Ban, Pencil, Check, X } from 'lucide-react';
import { getPlaylist, updatePlaylist } from '../../api/subsonic/playlists';
import { getCoverArtUrl, starItem, unstarItem } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import ArtistLinks from '../common/ArtistLinks';
import LongPressWrapper from '../common/LongPressWrapper';

export default function PlaylistDetailView() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const { queue, currentIndex, likedTrackIds, toggleTrackLike, excludedTrackIds, toggleTrackExclude, isPlaying, setQueueAndPlay, setIsProcessing } = usePlayerStore();
  const { openMenu } = useContextMenuStore();
  const downloads = useDownloadStore(state => state.downloads);

  useEffect(() => {
    const fetchPlaylistData = async () => {
      if (!id) return;
      try {
        const data = await getPlaylist(id);
        setPlaylist(data);
        setEditName(data?.name || '');
        setEditDesc(data?.comment || '');
      } catch (err) {
        console.error('Failed to fetch playlist:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylistData();
  }, [id]);

  const handleSave = async () => {
    if (!id || !playlist) return;
    try {
      await updatePlaylist(id, undefined, undefined, editName, editDesc);
      setPlaylist({ ...playlist, name: editName, comment: editDesc });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update playlist', err);
    }
  };

  const handleCancel = () => {
    setEditName(playlist?.name || '');
    setEditDesc(playlist?.comment || '');
    setIsEditing(false);
  };

  const handlePlayAll = () => {
    if (!playlist || !playlist.entry) return;
    setIsProcessing(true);
    setQueueAndPlay(playlist.entry.map((t: any) => ({
      id: t.id,
      title: t.title || t.name,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt, 300),
      duration: t.duration,
      bitRate: t.bitRate,
      suffix: t.suffix
    })), 0);
    setIsProcessing(false);
  };

  const handlePlaySong = (index: number) => {
    if (!playlist || !playlist.entry) return;
    setIsProcessing(true);
    setQueueAndPlay(playlist.entry.map((t: any) => ({
      id: t.id,
      title: t.title || t.name,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt, 300),
      duration: t.duration,
      bitRate: t.bitRate,
      suffix: t.suffix
    })), index);
    setIsProcessing(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!playlist) {
    return <div className="flex-1 flex items-center justify-center">{t('views.unknown_playlist', 'Unknown Playlist')}</div>;
  }

  const coverUrl = playlist.coverArt ? getCoverArtUrl(playlist.coverArt, 600) : null;
  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const tracks = playlist.entry || [];

  return (
    <div className="flex-1 overflow-y-auto relative h-full bg-transparent md:bg-background custom-scrollbar">
      <div className="relative z-10 px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6 md:gap-10 min-h-full pb-32 md:pb-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-end text-center md:text-left relative">
          <button 
            onClick={() => navigate(-1)}
            className="md:hidden absolute -top-2 left-0 p-2 rounded-full bg-black/40 hover:bg-black/60 text-foreground transition-colors z-20"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="w-48 h-48 md:w-64 md:h-64 rounded-xl shadow-2xl bg-black/20 flex items-center justify-center overflow-hidden shrink-0 mx-auto md:mx-0">
            {coverUrl ? (
              <img src={coverUrl} alt="Playlist Cover" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white/20 text-4xl">{t('common.playlists', 'Playlist')}</span>
            )}
          </div>
          
          <div className="flex flex-col gap-2 flex-1 w-full items-center md:items-start">
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-foreground/70">{t('views.playlist', 'Playlist')}</span>
            
            {isEditing ? (
              <div className="w-full max-w-md flex flex-col gap-3 my-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-foreground/10 text-foreground text-2xl font-bold px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('views.playlist_name', 'Playlist Name')}
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-foreground/10 text-foreground text-sm px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary resize-none h-20"
                  placeholder={t('views.playlist_desc', 'Description')}
                />
                <div className="flex gap-2">
                  <button onClick={handleSave} className="flex-1 bg-primary text-black py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:brightness-110">
                    <Check size={18} /> {t('views.save', 'Save')}
                  </button>
                  <button onClick={handleCancel} className="flex-1 bg-foreground/20 text-foreground py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-foreground/30">
                    <X size={18} /> {t('views.cancel', 'Cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-foreground tracking-tight leading-tight pt-1 mb-2 line-clamp-2">{playlist.name}</h1>
                  <button onClick={() => setIsEditing(true)} className="text-secondary hover:text-foreground transition-colors p-2 rounded-full hover:bg-white/5">
                    <Pencil size={24} />
                  </button>
                </div>
                {playlist.comment && (
                  <p className="text-secondary text-sm md:text-base max-w-2xl text-left line-clamp-3">{playlist.comment}</p>
                )}
              </>
            )}
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs md:text-sm text-foreground/70 font-medium mb-1 mt-2">
              <span>{playlist.songCount || 0} {t('views.tracks', 'tracks')}</span>
              <span>•</span>
              <span>{Math.floor((playlist.duration || 0) / 60)} {t('views.mins_abbr', 'm')}</span>
            </div>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 w-full mt-4">
              <button onClick={handlePlayAll} className="w-14 h-14 md:w-auto md:h-auto md:px-8 md:py-3 bg-primary md:bg-foreground text-background rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:scale-105 transition-transform shadow-xl">
                <Play fill="currentColor" size={24} className="md:size-18 ml-1 md:ml-0" /> <span className="hidden md:inline">{t('views.play', 'Play')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-6">
          <div className="hidden md:flex px-4 py-2 text-xs font-semibold tracking-widest text-secondary border-b border-white/10 uppercase mb-2">
            <div className="w-12 text-center">#</div>
            <div className="flex-1">{t('views.title', 'Title')}</div>
            <div className="w-24 flex justify-center gap-4"><Heart size={14} /><Ban size={14} /></div>
            <div className="w-16 text-right"><Clock size={14} className="inline-block" /></div>
          </div>
          
          {tracks.length === 0 ? (
            <div className="text-center text-secondary py-10">{t('views.playlist_empty', 'Playlist is empty')}</div>
          ) : (
            tracks.map((track: any, index: number) => {
              const currentPlaying = queue[currentIndex]?.id === track.id;
              const isTrackLiked = likedTrackIds.includes(track.id);
              const isTrackDownloaded = isItemDownloaded(downloads, track.id, track.albumId);
              
              return (
                <LongPressWrapper 
                  key={track.id + '-' + index}
                  onLongPress={(e: any) => { 
                    e.preventDefault(); 
                    openMenu(e.clientX, e.clientY, { ...track, coverArt: getCoverArtUrl(track.coverArt, 300) }, 'track'); 
                  }}
                  onClick={() => handlePlaySong(index)}
                  className={`flex items-center px-2 sm:px-4 py-2 sm:py-3 rounded-lg cursor-pointer group hover:bg-foreground/5 transition-colors ${currentPlaying ? 'bg-foreground/10' : ''}`}
                >
                  <div className="w-8 sm:w-12 text-center text-xs sm:text-sm font-medium text-secondary">
                    {currentPlaying ? (
                      isPlaying ? <Pause size={14} className="text-primary mx-auto stroke-none" fill="currentColor" /> : <Play size={14} className="text-primary mx-auto stroke-none" fill="currentColor" />
                    ) : (
                      <>
                        <span className="group-hover:hidden">{index + 1}</span>
                        <Play size={14} className="hidden group-hover:block mx-auto text-[#b3b3b3] stroke-none" fill="currentColor" />
                      </>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col min-w-0 pr-2 sm:pr-4">
                    <span className={`flex items-center gap-2 text-sm sm:text-base font-semibold truncate ${currentPlaying ? 'text-primary' : 'text-foreground'}`}>
                      <span className="truncate">{track.title}</span>
                      {isTrackDownloaded && <Download size={14} className="text-primary shrink-0" />}
                    </span>
                    <ArtistLinks artistString={track.artist} artistId={track.artistId} className="text-xs text-secondary truncate" />
                  </div>
                  <div className="hidden md:flex w-24 justify-center gap-4">
                    <Heart 
                      size={16} 
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${isTrackLiked ? 'opacity-100 text-primary' : 'text-[#b3b3b3]/50 hover:text-foreground'}`}
                      fill={isTrackLiked ? "currentColor" : "none"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackLike(track.id);
                        if (isTrackLiked) unstarItem(track.id);
                        else starItem(track.id);
                      }}
                    />
                    <Ban
                      size={16}
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${excludedTrackIds.includes(track.id) ? 'opacity-100 text-red-500' : 'text-[#b3b3b3]/50 hover:text-red-400'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackExclude(track.id);
                      }}
                    />
                  </div>
                  <div className="w-12 sm:w-16 text-right text-xs sm:text-sm text-secondary font-medium">
                    {formatTime(track.duration)}
                  </div>
                </LongPressWrapper>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
