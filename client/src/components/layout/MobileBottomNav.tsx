import { NavLink, useLocation } from 'react-router-dom';
import { Home, Library, Heart, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect } from 'react';
import { preloadMobileViews } from '../../App';

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const lastLibraryTabRef = useRef<string>('/library/albums');

  useEffect(() => {
    if (location.pathname.startsWith('/library/')) {
      lastLibraryTabRef.current = location.pathname;
    }
  }, [location.pathname]);

  const isLibraryActive = location.pathname.startsWith('/library');
  const libraryTo = isLibraryActive ? location.pathname : lastLibraryTabRef.current;

  return (
    <div 
      onPointerEnter={preloadMobileViews}
      onTouchStart={preloadMobileViews}
      className="md:hidden flex items-center justify-around bg-background/80 backdrop-blur-md transform-gpu will-change-transform border-t border-border h-[56px] pb-[env(safe-area-inset-bottom)] px-4 z-50 rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.4)] mt-[-1px]"
    >
      <NavItem to="/" icon={<Home size={26} />} label={t('sidebar.home')} end />
      <NavItem 
        to={libraryTo} 
        isActiveOverride={isLibraryActive}
        icon={<Library size={26} />} 
        label={t('common.library')} 
      />
      <NavItem to="/favorites" icon={<Heart size={26} />} label={t('sidebar.favorites')} />
      <NavItem to="/settings" icon={<Settings size={26} />} label={t('sidebar.settings')} />
    </div>
  );
}

function NavItem({ 
  to, 
  icon, 
  label, 
  end, 
  isActiveOverride 
}: { 
  to: string; 
  icon: React.ReactNode; 
  label: string; 
  end?: boolean;
  isActiveOverride?: boolean;
}) {
  return (
    <NavLink 
      to={to}
      end={end}
      className={({ isActive }) => {
        const active = typeof isActiveOverride === 'boolean' ? isActiveOverride : isActive;
        return `flex flex-col items-center gap-0.5 p-1 flex-1 transition-colors ${active ? 'text-primary' : 'text-secondary hover:text-foreground'}`;
      }}
    >
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </NavLink>
  );
}
