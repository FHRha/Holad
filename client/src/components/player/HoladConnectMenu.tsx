import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Tv2, Monitor, Smartphone, MonitorSpeaker, Radio, Headphones, Speaker, Info, Check, Loader2 } from 'lucide-react';
import { useHoladStore } from '../../store/holadStore';
import { usePlayerStore } from '../../store/playerStore';
import { useSocialStore } from '../../store/socialStore';
import { useTranslation } from 'react-i18next';

export default function HoladConnectMenu() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

  const devices = useHoladStore(s => s.devices);
  const activeDeviceId = useHoladStore(s => s.activeDeviceId);
  const localDeviceId = useHoladStore(s => s.deviceId);
  const setActiveDevice = useHoladStore(s => s.setActiveDevice);
  const isConnected = useHoladStore(s => s.roomId !== null);
  const connectionStatus = useHoladStore(s => s.connectionStatus);
  const roomId = useHoladStore(s => s.roomId);
  const connect = useHoladStore(s => s.connect);

  const jamRoomId = usePlayerStore(s => s.roomId);
  const participants = usePlayerStore(s => s.participants);
  const audioMode = useSocialStore(s => s.audioMode);
  const setAudioMode = useSocialStore(s => s.setAudioMode);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(event.target as Node) &&
        (!portalRef.current || !portalRef.current.contains(event.target as Node))
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside as any);
      document.addEventListener('touchstart', handleClickOutside as any);
    } else {
      touchStartY.current = null;
    }
    return () => {
       document.removeEventListener('mousedown', handleClickOutside as any);
       document.removeEventListener('touchstart', handleClickOutside as any);
    };
  }, [isOpen]);

  if (!isConnected && !jamRoomId) return null;

  const isThisDeviceActive = activeDeviceId === localDeviceId || (activeDeviceId === null && devices.some(d => d.id === localDeviceId));
  const isActive = isThisDeviceActive && devices.length > 0;

  const getDeviceIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('mobile') || n.includes('iphone') || n.includes('android')) return <Smartphone size={16} />;
    if (n.includes('tv')) return <Tv2 size={16} />;
    return <Monitor size={16} />;
  };

  const content = (isMobileView: boolean) => (
    <>
      <div 
        className={isMobileView 
          ? "px-4 pt-2 pb-3 border-b border-border mb-2 pt-4 pb-4 touch-none" 
          : "px-3 py-2 border-b border-border mb-2"
        }
        onTouchStart={isMobileView ? (e) => {
          touchStartY.current = e.touches[0].clientY;
          if (mobileMenuRef.current) mobileMenuRef.current.style.transition = 'none';
        } : undefined}
        onTouchMove={isMobileView ? (e) => {
          if (touchStartY.current !== null && mobileMenuRef.current) {
            const delta = e.touches[0].clientY - touchStartY.current;
            if (delta > 0) mobileMenuRef.current.style.transform = `translateY(${delta}px)`;
          }
        } : undefined}
        onTouchEnd={isMobileView ? (e) => {
          if (touchStartY.current !== null && mobileMenuRef.current) {
            const delta = e.changedTouches[0].clientY - touchStartY.current;
            mobileMenuRef.current.style.transition = 'transform 0.3s ease-out';
            if (delta > 80) {
              setIsOpen(false);
            } else {
              mobileMenuRef.current.style.transform = 'translateY(0px)';
            }
            touchStartY.current = null;
          }
        } : undefined}
      >
        {isMobileView && <div className="w-12 h-1.5 bg-foreground/20 rounded-full mx-auto mb-4" />}
        <h3 className="text-sm font-bold text-foreground">
          {jamRoomId ? t('social.active_jam') : t('player.connect_to_device')}
        </h3>
      </div>

      {jamRoomId && (
        <div className="px-3 pb-3 border-b border-border mb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
              <Radio size={14} className="animate-pulse" />
              <span>{t('social.in_jam_with', { count: participants.length || 1 })}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-1 bg-foreground/5 rounded-xl border border-border/40 mb-2">
            <button
              type="button"
              onClick={() => setAudioMode('speaker_dj')}
              className={`w-full px-3 py-2 rounded-lg text-left transition-all flex items-center justify-between gap-2 ${
                audioMode === 'speaker_dj'
                  ? 'bg-primary text-black font-bold shadow-sm'
                  : 'text-secondary hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Speaker size={15} className="shrink-0" />
                <span className="text-xs font-semibold">{t('social.mode_speaker')}</span>
              </div>
              {audioMode === 'speaker_dj' && <Check size={14} className="shrink-0" />}
            </button>
            <button
              type="button"
              onClick={() => setAudioMode('synced_audio')}
              className={`w-full px-3 py-2 rounded-lg text-left transition-all flex items-center justify-between gap-2 ${
                audioMode === 'synced_audio'
                  ? 'bg-primary text-black font-bold shadow-sm'
                  : 'text-secondary hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Headphones size={15} className="shrink-0" />
                <span className="text-xs font-semibold">{t('social.mode_headphones')}</span>
              </div>
              {audioMode === 'synced_audio' && <Check size={14} className="shrink-0" />}
            </button>
          </div>

          {audioMode === 'speaker_dj' && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-2.5 flex items-start gap-2 text-xs text-foreground/90 mt-1">
              <Info size={16} className="text-primary shrink-0 mt-0.5" />
              <p className="leading-snug text-[11px]">{t('social.mobile_speaker_hint')}</p>
            </div>
          )}
        </div>
      )}
      
      {isConnected && (
        <>
          {jamRoomId && (
            <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-secondary uppercase tracking-wider">
              {t('player.connect_to_device')}
            </div>
          )}
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
            {devices.map((device) => {
              const isDeviceActive = device.id === activeDeviceId;
              const isThisDevice = device.id === localDeviceId;
              
              return (
                <button
                  key={device.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveDevice(device.id);
                    setIsOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left group
                    ${isDeviceActive ? 'bg-primary/20 text-primary' : 'hover:bg-foreground/5 text-secondary hover:text-foreground'}
                  `}
                >
                  <div className={`p-2 rounded-full ${isDeviceActive ? 'bg-primary text-black' : 'bg-foreground/5 group-hover:bg-foreground/10 text-foreground'}`}>
                    {getDeviceIcon(device.name)}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className={`font-semibold text-sm truncate ${isDeviceActive ? 'text-primary' : 'text-foreground'}`}>
                      {isThisDevice ? t('player.this_browser') : device.name}
                    </span>
                    <span className="text-xs opacity-70 truncate">
                      {isDeviceActive ? t('player.listening_here') : 'Holad Connect'}
                    </span>
                  </div>
                </button>
              );
            })}
            
            {connectionStatus === 'connecting' && (
              <div className="px-3 py-4 flex items-center justify-center gap-2 text-sm text-secondary">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span>{t('player.connecting')}</span>
              </div>
            )}

            {connectionStatus === 'error' && (
              <div className="px-3 py-3 flex flex-col items-center gap-2 text-center text-xs text-red-400">
                <span>{t('player.connection_failed')}</span>
                {roomId && (
                  <button
                    onClick={() => connect(roomId)}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-foreground rounded-lg transition-colors text-xs font-semibold"
                  >
                    {t('player.retry')}
                  </button>
                )}
              </div>
            )}

            {connectionStatus !== 'connecting' && connectionStatus !== 'error' && devices.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-secondary">
                {t('player.devices_not_found')}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`transition-colors flex items-center justify-center w-5 ${isActive ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
        title={t('player.connect_to_device')}
      >
        <MonitorSpeaker size={16} />
      </button>

      {isOpen && (
        <>
          <div className="hidden md:block absolute bottom-full right-[-60px] mb-4 w-72 bg-card/95 backdrop-blur-xl transform-gpu border border-border rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
            {content(false)}
          </div>
          
          {createPortal(
            <div className="md:hidden" ref={portalRef}>
              <div className="fixed inset-0 bg-black/60 z-[9998] animate-in fade-in duration-200" onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
              <div 
                ref={mobileMenuRef}
                className="fixed bottom-0 left-0 right-0 w-full bg-card border-t border-border rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-[9999] overflow-hidden pb-8 animate-in slide-in-from-bottom-full duration-300"
                style={{ 
                  transition: 'transform 0.3s ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {content(true)}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
