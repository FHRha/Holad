import { useEffect, useRef, useState } from 'react';
import { Home, Heart, Disc, Music, Radio, Users, Settings, LogOut, User, Clock, Download, DownloadCloud, ListMusic } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { UpdateService } from '../../services/UpdateService';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { clearAppCache } from '../../utils/storage';
import { useDownloadStore } from '../../store/downloadStore';
import { isTauri, isCapacitor } from '../../utils/StorageManager';
import { openExternalLink } from '../../utils/linkHelper';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useDemoStore } from '../../store/demoStore';


export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { leftSidebarWidth, setLeftSidebarWidth } = useUIStore();
  const { user, url, setAuthenticated, setCredentials } = useAuthStore();
  const { role, roomId } = usePlayerStore();
  const isDemoMode = useDemoStore(state => state.isDemoMode);
  const slotId = useDemoStore(state => state.slotId);
  const isJamRoute = location.pathname.startsWith('/jam');
  const isJamGuest = isJamRoute && (role === 'listener' || role === 'cohost');
  const basePath = isJamRoute ? '/jam' : '/Holad';
  const appIcon = useSettingsStore(state => state.appIcon);
  const isNative = isTauri() || isCapacitor();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    UpdateService.getCurrentVersion().then((v) => {
      if (v && v !== '0.0.0') {
        setAppVersion(v);
      }
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = leftSidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = startWidth.current + (e.clientX - startX.current);
      if (newWidth < 40) {
         setLeftSidebarWidth(0);
         isResizing.current = false;
         document.body.style.cursor = 'default';
         document.body.style.userSelect = '';
      } else {
         setLeftSidebarWidth(Math.min(Math.max(newWidth, 80), 200));
      }
    };
    
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [leftSidebarWidth, setLeftSidebarWidth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && 
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setAuthenticated(false);
    setCredentials('', '', '', '');
    clearAppCache();
    window.location.reload();
  };

  if (leftSidebarWidth === 0) return null;

  const isWide = leftSidebarWidth > 120;

  return (
    <div 
      className="hidden md:flex bg-background flex-col py-4 border-r border-border relative z-40 flex-shrink-0"
      style={{ width: leftSidebarWidth }}
    >
      <div className={`flex flex-col flex-1 ${isWide ? 'px-4' : 'items-center'} space-y-6 overflow-visible`}>
        <div className="relative">
          <button 
            ref={buttonRef}
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={`text-foreground flex items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 ${!isWide ? 'flex-col' : 'px-2'} w-full`}
          >
            <img src={`${isTauri() || isCapacitor() ? '/' : import.meta.env.BASE_URL}icons/${appIcon === 'cassette' ? 'logo_cassette.png' : appIcon === 'wave_light' ? 'favicon_light.png' : 'favicon_dark.png'}`} alt="Holad" className={`${isWide ? 'w-10 h-10' : 'w-14 h-14'} rounded-lg shadow-lg object-cover flex-shrink-0`} />
            {isWide && <span className="font-bold text-lg whitespace-nowrap overflow-hidden text-ellipsis">Holad</span>}
          </button>

          {isProfileMenuOpen && (
            <div 
              ref={menuRef}
              className="absolute top-12 left-full ml-4 w-64 bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col py-2 animate-in fade-in zoom-in-95 duration-200"
            >
              <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="text-primary" size={20} />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-bold text-sm truncate">{isDemoMode && slotId ? `${t('demo.guest', 'Гость')} #${slotId}` : (user || t('sidebar.user'))}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <img 
                      src={`${isTauri() || isCapacitor() ? '/' : import.meta.env.BASE_URL}icons/navidrome.png`} 
                      alt="Navidrome" 
                      className="w-3.5 h-3.5 object-contain opacity-80 shrink-0" 
                    />
                    <span className="text-xs text-secondary truncate">{isDemoMode ? t('demo.demo_account', 'Демо-аккаунт') : (url ? new URL(url).hostname : t('sidebar.local_server'))}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col py-2 px-2 gap-1">
                <button 
                  onClick={() => {
                    useUIStore.getState().setSettingsOpen(true);
                    setIsProfileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors text-left w-full"
                >
                  <Settings size={18} />
                  <span>{t('sidebar.settings')}</span>
                </button>
                {!isJamGuest && (
                  <button 
                    onClick={() => {
                      navigate('/Holad/history');
                      setIsProfileMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors text-left w-full"
                  >
                    <Clock size={18} />
                    <span>{t('views.listening_history')}</span>
                  </button>
                )}
                <button 
                  onClick={() => {
                    openExternalLink('https://github.com/FHRha/Holad');
                    setIsProfileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors text-left w-full"
                >
                  <img src={`${isTauri() || isCapacitor() ? '/' : import.meta.env.BASE_URL}icons/github.png`} className="w-[18px] h-[18px] dark:invert opacity-70 group-hover:opacity-100 transition-opacity" alt="GitHub" />
                  <span>GitHub {appVersion && <span className="text-xs text-secondary/50 ml-1">v{appVersion}</span>}</span>
                </button>
                {!isJamGuest && (
                  <button 
                    onClick={() => {
                      UpdateService.checkForUpdates(true);
                      setIsProfileMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors text-left w-full"
                  >
                    <DownloadCloud size={18} />
                    <span>{t('sidebar.check_updates')}</span>
                  </button>
                )}
              </div>

              {!isJamGuest && !isDemoMode && (
                <div className="px-2 pt-2 border-t border-border">
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors text-left w-full"
                  >
                    <LogOut size={18} />
                    <span>{t('sidebar.logout')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`flex-1 w-full flex flex-col pt-4 ${isWide ? 'gap-1' : 'gap-6'}`}>
          {!isJamGuest && <SidebarItem to={basePath} icon={<Home size={isWide ? 20 : 22} className="flex-shrink-0" />} label={t('sidebar.home')} isWide={isWide} end />}
          {!isJamGuest && <SidebarItem to={`${basePath}/favorites`} icon={<Heart size={isWide ? 20 : 22} className="flex-shrink-0" />} label={t('sidebar.favorites')} isWide={isWide} />}
          <SidebarItem to={`${basePath}/albums${roomId ? `?room=${roomId}` : ''}`} icon={<Disc size={isWide ? 20 : 22} className="flex-shrink-0" />} label={t('sidebar.albums')} isWide={isWide} />
          {(!isJamGuest || role === 'cohost') && <SidebarItem to={`${basePath}/tracks${roomId ? `?room=${roomId}` : ''}`} icon={<Music size={isWide ? 20 : 22} className="flex-shrink-0" />} label={t('sidebar.tracks')} isWide={isWide} />}
          {(!isJamGuest || role === 'cohost') && <SidebarItem to={`${basePath}/artists${roomId ? `?room=${roomId}` : ''}`} icon={<Users size={isWide ? 20 : 22} className="flex-shrink-0" />} label={t('sidebar.artists')} isWide={isWide} />}
          {!isJamGuest && <SidebarItem to={`${basePath}/playlists`} icon={<ListMusic size={isWide ? 20 : 22} className="flex-shrink-0" />} label={t('sidebar.playlists')} isWide={isWide} />}
          {!isJamGuest && <SidebarItem to={`${basePath}/radio`} icon={<Radio size={isWide ? 20 : 22} className="flex-shrink-0" />} label={t('sidebar.radio')} isWide={isWide} />}
          {isNative && !isJamGuest && (
            <SidebarDownloadsItem isWide={isWide} />
          )}
        </div>
      </div>
      
      {/* Resizer */}
      <div 
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-foreground/10 active:bg-white/20 transition-colors z-20"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}

function SidebarDownloadsItem({ isWide }: { isWide: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const downloads = useDownloadStore(state => state.downloads);
  
  const items = Object.values(downloads || {});
  const activeDownloads = items.filter(d => d.status === 'downloading');
  const pausedDownloads = items.filter(d => d.status === 'paused');
  const queuedDownloads = items.filter(d => d.status === 'queued');
  const isDownloading = activeDownloads.length > 0 || pausedDownloads.length > 0;
  const totalActive = activeDownloads.length + pausedDownloads.length + queuedDownloads.length;
  
  const totalProgress = [...activeDownloads, ...pausedDownloads].reduce((acc, d) => acc + (d.progress || 0), 0);
  const avgProgress = isDownloading ? Math.round(totalProgress / (activeDownloads.length + pausedDownloads.length)) : 0;

  const to = '/Holad/downloads';
  const isActive = location.pathname.startsWith(to);

  // SVG Circular Ring geometry: r = 12, C = 2 * PI * 12 ~= 75.398
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (avgProgress / 100) * circumference;

  let tooltip = t('sidebar.downloads');
  if (isDownloading) {
    tooltip = `${tooltip}: ${avgProgress}% (${activeDownloads.length}/${totalActive})`;
  } else if (totalActive > 0) {
    tooltip = `${tooltip}: ${totalActive} ${t('views.queued')}`;
  }

  return (
    <NavLink
      to={to}
      className={`w-full flex ${
        isWide ? 'flex-row items-center px-3 py-2.5 gap-3 rounded-lg' : 'flex-col items-center gap-1'
      } transition-colors group ${
        isActive ? (isWide ? 'bg-foreground/10 text-primary' : 'text-primary') : 'text-secondary hover:text-foreground hover:bg-foreground/5'
      }`}
      title={tooltip}
    >
      {/* Icon Container */}
      <div className={`relative flex items-center justify-center ${!isWide ? 'w-full' : 'flex-shrink-0'}`}>
        {!isWide && isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-md" />
        )}

        {isDownloading ? (
          <div className="relative w-7 h-7 flex items-center justify-center">
            {/* Circular Progress Ring */}
            <svg className="w-7 h-7 -rotate-90" viewBox="0 0 32 32">
              {/* Background Track */}
              <circle
                cx="16"
                cy="16"
                r={radius}
                className="stroke-white/15"
                strokeWidth="2.5"
                fill="none"
              />
              {/* Animated Progress Ring */}
              <circle
                cx="16"
                cy="16"
                r={radius}
                className="stroke-primary transition-all duration-300 ease-out"
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <Download size={13} className="absolute text-primary animate-pulse flex-shrink-0" />
          </div>
        ) : (
          <Download size={isWide ? 20 : 22} className="flex-shrink-0" />
        )}

        {/* Compact Mode Badge (Top-Right of icon) */}
        {!isWide && totalActive > 0 && (
          <span className="absolute -top-1.5 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold bg-primary text-black rounded-full shadow-md animate-in zoom-in-50 duration-200">
            {totalActive > 99 ? '99+' : totalActive}
          </span>
        )}
      </div>

      {/* Expanded / Wide Mode Info */}
      {isWide ? (
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis pb-0.5">
              {t('sidebar.downloads')}
            </span>
            {isDownloading ? (
              <span className="text-xs font-bold text-primary shrink-0 tabular-nums">
                {avgProgress}%
              </span>
            ) : totalActive > 0 ? (
              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 rounded-full shrink-0">
                {totalActive}
              </span>
            ) : null}
          </div>

          {/* Dynamic Status Text & Mini Progress Bar */}
          {isDownloading && (
            <div className="w-full mt-1 flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-secondary">
                <span className="truncate">
                  {totalActive > 1
                    ? t('sidebar.downloading_of', {
                        current: activeDownloads.length,
                        total: totalActive,
                      })
                    : t('sidebar.downloading')}
                </span>
              </div>
              <div className="w-full bg-foreground/10 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${avgProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Compact Mode Label */
        <span className="text-[10px] font-bold leading-normal mt-1 px-1 text-center truncate w-full pb-0.5">
          {isDownloading ? `${avgProgress}%` : t('sidebar.downloads')}
        </span>
      )}
    </NavLink>
  );
}

function SidebarItem({ to, icon, label, end, isWide, disabled }: { to: string, icon: React.ReactNode, label: string, end?: boolean, isWide: boolean, disabled?: boolean }) {
  const location = useLocation();
  // Properly check active state including trailing slashes which NavLink sometimes misses
  const path = location.pathname;
  const toPathname = to.split('?')[0];
  const isActive = end ? (path === toPathname || path === `${toPathname}/`) : path.startsWith(toPathname);

  return (
    <NavLink 
      to={to}
      end={end}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
        }
      }}
      className={`w-full flex ${isWide ? 'flex-row items-center px-3 py-2.5 gap-3 rounded-lg' : 'flex-col items-center gap-1'} transition-colors group ${disabled ? 'opacity-50 cursor-not-allowed text-secondary' : isActive ? (isWide ? 'bg-foreground/10 text-primary' : 'text-primary') : 'text-secondary hover:text-foreground hover:bg-foreground/5'}`}
      title={disabled ? `${label} (Offline)` : label}
    >
      <div className={`relative flex justify-center ${!isWide ? 'w-full' : ''} ${isActive && !disabled ? 'text-primary' : ''}`}>
        {!isWide && isActive && !disabled && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-md"></div>}
        {icon}
      </div>
      {isWide ? (
        <span className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis pb-0.5">{label}</span>
      ) : (
        <span className="text-[10px] font-bold leading-normal mt-1 px-1 text-center truncate w-full pb-0.5">{label}</span>
      )}
    </NavLink>
  );
}
