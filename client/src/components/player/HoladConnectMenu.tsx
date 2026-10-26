import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useHoladStore } from '../../store/holadStore';
import { usePlayerStore } from '../../store/playerStore';
import { useSocialStore } from '../../store/socialStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAudioOutputDevice } from '../../hooks/useAudioOutputDevice';
import {
  ConnectTriggerButton,
  ConnectAudioOutputSection,
  ConnectJamSection,
  ConnectDisabledNotice,
  ConnectDeviceList,
} from './connect';

export interface HoladConnectMenuProps {
  variant?: 'icon' | 'pill';
  transparent?: boolean;
  className?: string;
}

export default function HoladConnectMenu({
  variant = 'icon',
  transparent = false,
  className,
}: HoladConnectMenuProps) {
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
  const isHoladConnectEnabled = useSettingsStore(s => s.isHoladConnectEnabled);
  const connectionStatus = useHoladStore(s => s.connectionStatus);
  const connectError = useHoladStore(s => s.connectError);
  const roomId = useHoladStore(s => s.roomId);
  const connect = useHoladStore(s => s.connect);

  const jamRoomId = usePlayerStore(s => s.roomId);
  const participants = usePlayerStore(s => s.participants);
  const audioMode = useSocialStore(s => s.audioMode);
  const setAudioMode = useSocialStore(s => s.setAudioMode);

  const outputDevice = useAudioOutputDevice();

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

  // For icon variant, hide if enabled but not connected to Holad or Jam
  if (variant === 'icon' && isHoladConnectEnabled && !isConnected && !jamRoomId) return null;

  const isThisDeviceActive = activeDeviceId === localDeviceId || (activeDeviceId === null && devices.some(d => d.id === localDeviceId));
  const isActive = isThisDeviceActive && devices.length > 0;

  const isRemoteActive = isConnected && activeDeviceId !== null && activeDeviceId !== localDeviceId;
  const activeRemoteDevice = isRemoteActive ? devices.find(d => d.id === activeDeviceId) : null;

  const content = (isMobileView: boolean) => (
    <>
      <div 
        className={isMobileView 
          ? "px-4 pt-4 pb-3 border-b border-black/10 dark:border-white/10 touch-none" 
          : "px-3 py-2 border-b border-black/10 dark:border-white/10"
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

      {/* Local output device badge - only on main device, not on remote control */}
      <ConnectAudioOutputSection isRemoteActive={isRemoteActive} outputDevice={outputDevice} />

      {jamRoomId && (
        <ConnectJamSection
          participantsCount={participants.length || 1}
          audioMode={audioMode}
          onSetAudioMode={setAudioMode}
        />
      )}
      
      {!isHoladConnectEnabled ? (
        <ConnectDisabledNotice />
      ) : isConnected ? (
        <ConnectDeviceList
          devices={devices}
          activeDeviceId={activeDeviceId}
          localDeviceId={localDeviceId}
          connectionStatus={connectionStatus}
          connectError={connectError}
          roomId={roomId}
          showJamHeader={!!jamRoomId}
          onSelectDevice={(deviceId) => {
            setActiveDevice(deviceId);
            setIsOpen(false);
          }}
          onRetry={() => {
            if (roomId) connect(roomId);
          }}
        />
      ) : !isRemoteActive ? (
        <div className="px-3 py-3 text-center text-xs text-secondary">
          <p>{t('player.listening_on')}: <strong className="text-foreground">{outputDevice.name}</strong></p>
        </div>
      ) : null}
    </>
  );

  return (
    <div className={`relative ${className || ''}`} ref={menuRef}>
      <ConnectTriggerButton
        variant={variant}
        transparent={transparent}
        isActive={isActive}
        isRemoteActive={isRemoteActive}
        activeRemoteDevice={activeRemoteDevice}
        jamRoomId={jamRoomId}
        outputDevice={outputDevice}
        onClick={() => setIsOpen(!isOpen)}
      />

      {isOpen && (
        <>
          <div className="hidden md:block absolute bottom-full right-[-60px] mb-4 w-72 bg-card/95 backdrop-blur-xl transform-gpu border border-black/10 dark:border-white/10 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
            {content(false)}
          </div>
          
          {createPortal(
            <div className="md:hidden" ref={portalRef}>
              <div
                className="fixed inset-0 bg-black/60 z-[9998] animate-in fade-in duration-200"
                onTouchStart={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              />
              <div 
                ref={mobileMenuRef}
                className="fixed bottom-0 left-0 right-0 w-full bg-card border-t border-black/10 dark:border-white/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-[9999] overflow-hidden pb-8 animate-in slide-in-from-bottom-full duration-300"
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
