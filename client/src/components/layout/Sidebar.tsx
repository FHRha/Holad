import { Menu, Home, Heart, Disc, Music, Radio, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import JamSessionControl from '../jam/JamSessionControl';

export default function Sidebar() {
  return (
    <div className="hidden md:flex w-24 bg-background flex-col items-center py-4 border-r border-white/5 relative z-10 space-y-6">
      <button className="text-secondary hover:text-foreground flex flex-col items-center gap-1 transition-colors">
        <Menu size={24} />
        <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Меню</span>
      </button>

      <div className="flex-1 w-full flex flex-col gap-6 pt-4">
        <SidebarItem to="/Holad" icon={<Home size={22} />} label="Главная" end />
        <SidebarItem to="/Holad/favorites" icon={<Heart size={22} />} label="Избранное" />
        <SidebarItem to="/Holad/albums" icon={<Disc size={22} />} label="Альбомы" />
        <SidebarItem to="/Holad/tracks" icon={<Music size={22} />} label="Треки" />
        <SidebarItem to="/Holad/artists" icon={<Users size={22} />} label="Артисты" />
        <SidebarItem to="/Holad/radio" icon={<Radio size={22} />} label="Радио" />
      </div>

      <div className="w-full px-2">
        <JamSessionControl />
      </div>
    </div>
  );
}

function SidebarItem({ to, icon, label, end }: { to: string, icon: React.ReactNode, label: string, end?: boolean }) {
  return (
    <NavLink 
      to={to}
      end={end}
      className={({ isActive }) => `w-full flex flex-col items-center gap-1 transition-colors group ${isActive ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
    >
      {({ isActive }) => (
        <>
          <div className={`relative flex justify-center w-full ${isActive ? 'text-primary' : ''}`}>
            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-md"></div>}
            {icon}
          </div>
          <span className="text-[10px] font-bold leading-none mt-1 px-1 text-center">{label}</span>
        </>
      )}
    </NavLink>
  );
}
