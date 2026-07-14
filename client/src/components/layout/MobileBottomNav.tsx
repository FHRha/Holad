import { NavLink } from 'react-router-dom';
import { Home, Library, Heart, Search, Settings } from 'lucide-react';

export default function MobileBottomNav() {
  return (
    <div className="md:hidden flex items-center justify-around bg-background/95 backdrop-blur-md border-t border-white/5 pb-safe pt-2 px-2 z-50">
      <NavItem to="/Holad" icon={<Home size={24} />} label="Главная" end />
      <NavItem to="/Holad/library" icon={<Library size={24} />} label="Библиотека" />
      <NavItem to="/Holad/favorites" icon={<Heart size={24} />} label="Избранное" />
      <NavItem to="/Holad/search" icon={<Search size={24} />} label="Поиск" />
      <NavItem to="/Holad/settings" icon={<Settings size={24} />} label="Настройки" />
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
