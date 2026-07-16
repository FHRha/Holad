import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../../store/audioStore';
import { usePlayerStore } from '../../store/playerStore';
import { useLyricsSync } from '../../hooks/useLyricsSync';
import type { Track } from '../../types';

interface MobileLyricsTabProps {
  currentTrack: Track;
  isActive: boolean;
}

export default function MobileLyricsTab({ currentTrack, isActive }: MobileLyricsTabProps) {
  const { t } = useTranslation();
  const { audioElement } = useAudioStore();
  const { role } = usePlayerStore();

  const {
    lyricsText,
    lrcLines,
    loadingLyrics,
    activeLyricIndex,
    isUserScrolled,
    lyricsContainerRef,
    handleUserScroll,
    forceSync,
    setIsUserScrolled
  } = useLyricsSync(currentTrack, audioElement, isActive);

  return (
    <div 
      className="w-full h-full flex flex-col relative"
      onScroll={handleUserScroll}
      onTouchMove={handleUserScroll}
      onWheel={handleUserScroll}
    >
      {isUserScrolled && lrcLines.length > 0 && (
        <button 
          onClick={forceSync}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-8 py-3 bg-primary text-background rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all text-sm tracking-wider"
        >
          {t('player.sync', { defaultValue: 'Sync' })}
        </button>
      )}

      <div className="flex-1 overflow-y-auto hide-scrollbar px-6">
        <div className="flex flex-col items-center justify-start text-center py-6 min-h-full">
          {loadingLyrics ? (
            <p className="text-white/50 animate-pulse text-base mt-20">{t('player.loading_lyrics', { defaultValue: 'Loading lyrics...' })}</p>
          ) : lrcLines.length > 0 ? (
            <div ref={lyricsContainerRef} className="flex flex-col gap-6 pt-[30vh] pb-[30vh] w-full transition-all duration-300">
              {lrcLines.map((line, idx) => {
                const isLyricActive = idx === activeLyricIndex;
                const isPast = idx < activeLyricIndex;
                
                if (line.isInterlude) {
                  return (
                    <div key={idx} className={`flex justify-center items-center gap-3 transition-all duration-500 py-4 ${isLyricActive ? 'scale-110' : 'opacity-40'}`}>
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-2 h-2 rounded-full bg-white/20 relative overflow-hidden">
                          <div 
                            className="absolute inset-0 bg-white transition-opacity duration-100"
                            style={{ 
                              opacity: isLyricActive ? `calc((var(--interlude-progress, 0) - ${i * 0.33}) * 3)` : 0
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  );
                }
                
                const isSectionHeader = (line.text.trim().startsWith('[') && line.text.trim().endsWith(']')) || (line.text.trim().startsWith('(') && line.text.trim().endsWith(')'));
                
                return (
                  <div 
                    key={idx} 
                    className={`text-xl md:text-2xl font-bold tracking-tight transition-all duration-500 px-2 ${
                      isLyricActive 
                        ? 'text-primary scale-110 drop-shadow-[0_0_15px_rgba(29,185,84,0.5)]' 
                        : isPast 
                          ? (isSectionHeader ? 'text-primary/40' : 'text-white/40')
                          : (isSectionHeader ? 'text-primary/70' : 'text-white/30 hover:text-white/50')
                    } ${role !== 'listener' ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (role === 'listener') return;
                      if (audioElement) {
                        if (audioElement.paused) {
                          audioElement.play().catch(console.error);
                          usePlayerStore.getState().setIsPlaying(true);
                        }
                        audioElement.currentTime = line.time;
                      }
                      setIsUserScrolled(false);
                    }}
                  >
                    {line.text}
                  </div>
                );
              })}
            </div>
          ) : lyricsText ? (
            <div className="w-full flex flex-col items-center gap-4 pb-24 pt-6 text-center">
              {lyricsText.split('\n').map((line, idx) => {
                const text = line.trim();
                if (!text) return <div key={idx} className="h-2" />;
                
                const isSectionHeader = (text.startsWith('[') && text.endsWith(']')) || (text.startsWith('(') && text.endsWith(')'));
                
                return (
                  <div 
                    key={idx}
                    className={`${
                      isSectionHeader 
                        ? 'text-xs font-bold text-primary tracking-widest uppercase mt-4 mb-1' 
                        : 'text-lg font-bold text-white/80'
                    }`}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-white/40 text-base flex flex-col items-center gap-2 mt-20">
              <p>{t('player.lyrics_not_found', { defaultValue: 'Lyrics not found' })}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
