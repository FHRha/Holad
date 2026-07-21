import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, SkipBack, SkipForward, Heart, Maximize2, X, Music } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';
import { useSettingsStore } from '../../store/settingsStore';

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result 
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '29, 185, 84';
};

const COLORS: Record<string, string> = {
  green: '#1db954',
  blue: '#3b82f6',
  purple: '#a855f7',
  red: '#ef4444',
  orange: '#f97316',
  pink: '#ec4899',
  yellow: '#eab308'
};

export default function TrayMenu() {
  const { t } = useTranslation();
  
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const accentColor = useSettingsStore(state => state.accentColor);

  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.style.backgroundColor = 'transparent';
    document.documentElement.style.setProperty('background-color', 'transparent', 'important');
    document.body.style.setProperty('background-color', 'transparent', 'important');
    document.body.style.backgroundImage = 'none';
    document.documentElement.style.outline = 'none';
    document.body.style.outline = 'none';
    document.documentElement.style.border = 'none';
    document.body.style.border = 'none';
    
    // Add a class to hide scrollbars just in case
    document.body.style.overflow = 'hidden';

    // Sync Zustand across windows
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'streamnavi-settings') {
        useSettingsStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => { 
      if (root) root.style.backgroundColor = '';
      document.documentElement.style.removeProperty('background-color');
      document.body.style.removeProperty('background-color');
      document.body.style.backgroundImage = '';
      document.body.style.overflow = '';
      document.documentElement.style.outline = '';
      document.body.style.outline = '';
      document.documentElement.style.border = '';
      document.body.style.border = '';
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Sync Accent Color
  useEffect(() => {
    const hexColor = COLORS[accentColor] || (accentColor?.startsWith('#') ? accentColor : COLORS.green);
    const rgbStr = hexToRgb(hexColor);
    const rgbSpaceStr = rgbStr.replace(/,/g, '');
    
    document.documentElement.style.setProperty('--color-primary', rgbSpaceStr); 
    document.documentElement.style.setProperty('--color-primary-rgb', rgbStr);
  }, [accentColor]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    let unlisten: any;
    const setup = async () => {
      const { listen, emit } = await import('@tauri-apps/api/event');

      unlisten = await listen<any>('tray-state-sync', (event) => {
        if (!event.payload) return;
        const { track, playing, liked } = event.payload;
        setCurrentTrack(track);
        setIsPlaying(playing);
        setIsLiked(liked);
      });

      // Request initial state
      emit('request-tray-sync').catch(err => console.error("request-tray-sync err:", err));
    };
    setup().catch(err => console.error("setup err:", err));

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Dynamically resize window to fit content perfectly
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const adjustSize = async () => {
       try {
         const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
         const menuEl = document.getElementById('tray-menu-content');
         if (menuEl) {
            const height = menuEl.offsetHeight + 16; // +16 for p-2 margins
            await getCurrentWindow().setSize(new LogicalSize(320, height));
         }
       } catch (err) {}
    };
    setTimeout(adjustSize, 50);
  }, [currentTrack]);

  const handleAction = async (action: string) => {
    if ('__TAURI_INTERNALS__' in window) {
      try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('tray-control', action);
      } catch (err) {
        console.error("handleAction err:", err);
      }
    }
  };

  const quitApp = async () => {
    if ('__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('quit_app');
    }
  };

  const showApp = async () => {
    if ('__TAURI_INTERNALS__' in window) {
      try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('tray-control', 'show_app');
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().hide();
      } catch (err) {
        console.error('showApp err:', err);
      }
    }
  };

  return (
    <div className="h-[100vh] w-[100vw] overflow-hidden p-2 bg-transparent">
      <div id="tray-menu-content" className="w-full bg-background/90 backdrop-blur-2xl text-white rounded-xl border border-white/10 flex flex-col shadow-2xl p-2 select-none" data-tauri-drag-region>
        {/* Header */}
        <div className="flex items-center gap-3 p-3 mb-1 border-b border-white/5 pointer-events-none">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Music className="text-primary w-4 h-4" />
          </div>
          <div className="font-bold tracking-wider text-sm">
            HOLAD <span className="text-primary">MUSIC</span>
          </div>
        </div>

        {/* Track Info */}
        <div className="px-3 py-2 flex items-center gap-3 pointer-events-none">
          {currentTrack ? (
            <>
              <img 
                src={currentTrack.coverArt?.includes('http') ? currentTrack.coverArt : getCoverArtUrl(currentTrack.coverArt || currentTrack.id, 100)} 
                className="w-10 h-10 rounded-md object-cover shadow-md"
                alt="Cover"
              />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${isPlaying ? 'text-primary' : 'text-white'}`}>{currentTrack.title}</div>
                <div className="text-xs truncate text-white/50">{currentTrack.artist}</div>
              </div>
            </>
          ) : (
            <div className="text-sm text-white/50 italic py-2">
              {t('common.no_track', { defaultValue: 'Нет активного трека' })}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-1 mt-2">
          <button onClick={() => handleAction('play_pause')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium w-full text-left">
            {isPlaying ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-primary" />}
            <span className={isPlaying ? 'text-primary' : ''}>
              {isPlaying ? t('player.pause', { defaultValue: 'Пауза' }) : t('player.play', { defaultValue: 'Воспроизвести' })}
            </span>
          </button>
          
          <button onClick={() => handleAction('next')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium w-full text-left">
            <SkipForward className="w-4 h-4" />
            {t('player.next', { defaultValue: 'Следующий трек' })}
          </button>
          
          <button onClick={() => handleAction('prev')} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium w-full text-left">
            <SkipBack className="w-4 h-4" />
            {t('player.previous', { defaultValue: 'Предыдущий трек' })}
          </button>
        </div>

        <div className="h-px bg-white/5 my-2 mx-2"></div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          <button 
            onClick={() => handleAction('favorite')}
            disabled={!currentTrack}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium w-full text-left ${currentTrack && isLiked ? 'text-primary hover:bg-primary/10' : 'hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent'}`}
          >
            <Heart className={`w-4 h-4 ${currentTrack && isLiked ? 'fill-primary text-primary' : ''}`} />
            {currentTrack && isLiked 
              ? t('common.in_favorites', { defaultValue: 'В избранном' })
              : t('common.add_favorite', { defaultValue: 'Добавить в избранное' })}
          </button>

          <div className="h-px bg-white/5 my-2 mx-2"></div>

          <button onClick={showApp} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium w-full text-left">
            <Maximize2 className="w-4 h-4" />
            {t('common.show_app', { defaultValue: 'Показать Holad' })}
          </button>

          <button onClick={quitApp} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors text-sm font-medium w-full text-left">
            <X className="w-4 h-4" />
            {t('common.quit', { defaultValue: 'Выйти' })}
          </button>
        </div>
      </div>
    </div>
  );
}
