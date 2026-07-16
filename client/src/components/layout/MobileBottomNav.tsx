import { NavLink } from 'react-router-dom';
import { Home, Library, Heart, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function MobileBottomNav() {
  const { t } = useTranslation();
  
  return (
    <div className="md:hidden flex items-center justify-around bg-[#121212]/70 backdrop-blur-2xl border-t border-white/10 h-[56px] pb-[env(safe-area-inset-bottom)] px-4 z-50 rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.4)] mt-[-1px]">
      <NavItem to="/Holad" icon={<Home size={26} />} label={t('sidebar.home')} end />
      <NavItem to="/Holad/library" icon={<Library size={26} />} label={t('common.library')} />
      <NavItem to="/Holad/favorites" icon={<Heart size={26} />} label={t('sidebar.favorites')} />
      <NavItem to="/Holad/settings" icon={<Settings size={26} />} label={t('sidebar.settings')} />
    </div>
  );
}

function NavItem({ to, icon, label, end }: { to: string, icon: React.ReactNode, label: string, end?: boolean }) {
  return (
    <NavLink 
      to={to}
      end={end}
      className={({ isActive }) => `flex flex-col items-center gap-0.5 p-1 flex-1 transition-colors ${isActive ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
    >
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </NavLink>
  );
}
