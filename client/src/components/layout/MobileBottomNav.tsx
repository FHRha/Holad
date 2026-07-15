import { NavLink } from 'react-router-dom';
import { Home, Library, Heart, Search, Settings } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useTranslation } from 'react-i18next';

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const { setSearchOpen } = useUIStore();
  
  return (
    <div className="md:hidden flex items-center justify-around bg-background/95 backdrop-blur-md border-t border-white/5 pb-safe pt-2 px-2 z-50">
      <NavItem to="/Holad" icon={<Home size={24} />} label={t('sidebar.home')} end />
      <NavItem to="/Holad/library" icon={<Library size={24} />} label={t('common.library')} />
      <NavItem to="/Holad/favorites" icon={<Heart size={24} />} label={t('sidebar.favorites')} />
      <button 
        onClick={() => setSearchOpen(true)}
        className="flex flex-col items-center gap-1 p-2 transition-colors text-secondary hover:text-foreground"
      >
        <Search size={24} />
        <span className="text-sm font-bold">{t('sidebar.search', { defaultValue: 'Поиск' })}</span>
      </button>
      <NavItem to="/Holad/settings" icon={<Settings size={24} />} label={t('sidebar.settings')} />
    </div>
  );
}

function NavItem({ to, icon, label, end }: { to: string, icon: React.ReactNode, label: string, end?: boolean }) {
  return (
    <NavLink 
      to={to}
      end={end}
      className={({ isActive }) => `flex flex-col items-center gap-1 p-2 transition-colors ${isActive ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
    >
      {icon}
      <span className="text-sm font-bold">{label}</span>
    </NavLink>
  );
}
