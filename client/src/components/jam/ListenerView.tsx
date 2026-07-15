import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { Play, Pause } from 'lucide-react';
import { getSong, getCoverArtUrl, getStreamUrl } from '../../api/subsonic';
import { formatArtistName } from '../../utils/formatters';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../common/LanguageSelector';

export default function ListenerView({ trackId }: { trackId?: string }) {
  const { t } = useTranslation();
  const { queue, currentIndex, setQueueAndPlay, isPlaying, setIsPlaying } = usePlayerStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentTrack = queue[currentIndex];

  useEffect(() => {
    if (trackId) {
      getSong(trackId).then(t => {
        if (t) {
          setQueueAndPlay([{
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumId: t.albumId,
            artistId: t.artistId,
            coverArt: getCoverArtUrl(t.coverArt || t.albumId || t.id, 300),
            duration: t.duration
          }], 0);
        }
      });
    }
  }, [trackId, setQueueAndPlay]);

  useEffect(() => {
    if (audioRef.current && currentTrack) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  if (!currentTrack) {
    return (
      <div className="flex-1 flex items-center justify-center text-secondary h-full bg-background relative z-10">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">{t('player.waiting_track')}</h2>
          <p className="text-sm">{t('player.nothing_playing')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full relative overflow-hidden flex text-foreground z-10 w-full">
      {/* Hidden Audio Player for standalone mode */}
      <audio 
        ref={audioRef} 
        src={currentTrack ? getStreamUrl(currentTrack.id) : undefined} 
        onEnded={() => {/* next track logic if needed */}}
        autoPlay
      />
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center blur-3xl opacity-30 scale-110"
        style={{ backgroundImage: `url(${currentTrack.coverArt})` }}
      />
      <div className="absolute inset-0 z-0 bg-black/40" />

      {/* Main Content Area */}
      <div className="relative z-10 flex w-full h-full p-10 gap-10">
        
        {/* Left: Large Cover & Info */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-[400px] h-[400px] rounded-lg overflow-hidden shadow-2xl mb-8 border border-white/10 bg-muted">
            <img src={currentTrack.coverArt} className="w-full h-full object-cover" alt="" />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-center">{currentTrack.title}</h1>
          <h2 className="text-xl text-secondary mb-1 text-center">{formatArtistName(currentTrack.artist)}</h2>
          <p className="text-sm text-foreground/50 mb-6 text-center">{currentTrack.album || 'Unknown Album'}</p>
          
          <div className="flex gap-4 mb-6">
            <span className="px-3 py-1 bg-black/50 rounded text-[10px] font-bold tracking-wider border border-white/5">MP3</span>
            <span className="px-3 py-1 bg-black/50 rounded text-[10px] font-bold tracking-wider border border-white/5">320kbps</span>
          </div>

          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-16 h-16 bg-primary text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>
        </div>

        {/* Right: Queue Table */}
        <div className="w-[600px] bg-black/40 rounded-xl border border-white/5 flex flex-col backdrop-blur-md overflow-hidden">
          <div className="relative flex items-center justify-center gap-6 px-6 py-4 border-b border-white/5 text-xs font-semibold tracking-wider text-secondary uppercase">
            <div className="absolute left-6">
              <LanguageSelector />
            </div>
            <span className="text-foreground border-b-2 border-foreground pb-1">{t('player.now_playing')}</span>
            <span className="hover:text-foreground cursor-pointer">{t('player.similar')}</span>
            <span className="hover:text-foreground cursor-pointer">{t('player.lyrics')}</span>
          </div>

          <div className="flex px-6 py-3 text-[10px] font-semibold tracking-wider text-secondary border-b border-white/5 uppercase mt-2">
            <div className="w-8">#</div>
            <div className="flex-1">Title</div>
            <div className="w-20">Time</div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 hide-scrollbar">
            {queue.map((track, idx) => {
              const isPlaying = idx === currentIndex;
              return (
                <div 
                  key={idx} 
                  className={`flex items-center px-4 py-2 rounded-md ${isPlaying ? 'bg-white/10' : ''}`}
                >
                  <div className="w-8 text-secondary text-xs flex items-center">
                    {isPlaying ? <Play size={12} className="text-primary" fill="currentColor" /> : idx + 1}
                  </div>
                  <div className="w-10 h-10 flex-shrink-0 mr-3 rounded overflow-hidden">
                    <img src={track.coverArt} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className={`truncate text-sm font-medium ${isPlaying ? 'text-primary' : 'text-foreground'}`}>{track.title}</p>
                    <p className="truncate text-xs text-secondary">{formatArtistName(track.artist)}</p>
                  </div>
                  <div className="w-20 text-xs text-secondary flex items-center">
                    {formatTime(track.duration)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
