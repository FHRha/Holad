import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Tv2, Monitor, Smartphone, MonitorSpeaker } from 'lucide-react';
import { useHoladStore } from '../../store/holadStore';
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

  if (!isConnected) return null;

  const isActive = activeDeviceId === localDeviceId || activeDeviceId === null;

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
          ? "px-3 pt-2 pb-3 border-b border-white/10 mb-2 pt-4 pb-4 touch-none" 
          : "px-3 py-2 border-b border-white/10 mb-2"
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
        {isMobileView && <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />}
        <h3 className="text-sm font-bold text-foreground">{t('player.connect_to_device', { defaultValue: 'Подключиться к устройству' })}</h3>
      </div>
      
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
                ${isDeviceActive ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-secondary hover:text-foreground'}
              `}
            >
              <div className={`p-2 rounded-full ${isDeviceActive ? 'bg-primary text-black' : 'bg-white/5 group-hover:bg-white/10 text-foreground'}`}>
                {getDeviceIcon(device.name)}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className={`font-semibold text-sm truncate ${isDeviceActive ? 'text-primary' : 'text-foreground'}`}>
                  {isThisDevice ? t('player.this_browser', { defaultValue: 'Этот браузер' }) : device.name}
                </span>
                <span className="text-xs opacity-70 truncate">
                  {isDeviceActive ? t('player.listening_here', { defaultValue: 'Слушаем здесь' }) : 'Holad Connect'}
                </span>
              </div>
            </button>
          );
        })}
        
        {devices.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-secondary">
            {t('player.devices_not_found', { defaultValue: 'Устройства не найдены' })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`transition-colors flex items-center justify-center w-5 ${isActive ? 'text-primary' : 'text-secondary hover:text-white'}`}
        title={t('player.connect_to_device', { defaultValue: 'Подключиться к устройству' })}
      >
        <MonitorSpeaker size={16} />
      </button>

      {isOpen && (
        <>
          <div className="hidden md:block absolute bottom-full right-[-60px] mb-4 w-64 bg-card/95 backdrop-blur-xl transform-gpu border border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
            {content(false)}
          </div>
          
          {createPortal(
            <div className="md:hidden" ref={portalRef}>
              <div className="fixed inset-0 bg-black/60 z-[9998] animate-in fade-in duration-200" onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
              <div 
                ref={mobileMenuRef}
                className="fixed bottom-0 left-0 right-0 w-full bg-[#1c1c1c] border-t border-white/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-[9999] overflow-hidden pb-8 animate-in slide-in-from-bottom-full duration-300"
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
