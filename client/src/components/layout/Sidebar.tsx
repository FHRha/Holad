import { useEffect, useRef } from 'react';
import { Home, Heart, Disc, Music, Radio, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';

export default function Sidebar() {
  const { leftSidebarWidth, setLeftSidebarWidth } = useUIStore();
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

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

  if (leftSidebarWidth === 0) return null;

  const isWide = leftSidebarWidth > 120;

  return (
    <div 
      className="hidden md:flex bg-background flex-col py-4 border-r border-white/5 relative z-10 flex-shrink-0"
      style={{ width: leftSidebarWidth }}
    >
      <div className={`flex flex-col flex-1 ${isWide ? 'px-4' : 'items-center'} space-y-6 overflow-hidden`}>
        <button className={`text-foreground flex items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 ${!isWide ? 'flex-col' : 'px-2'}`}>
          <img src="/icons/favicon_tab.png" alt="Holad" className={`${isWide ? 'w-10 h-10' : 'w-14 h-14'} rounded-lg shadow-lg object-cover flex-shrink-0`} />
          {isWide && <span className="font-bold text-lg whitespace-nowrap overflow-hidden text-ellipsis">Holad</span>}
        </button>

        <div className={`flex-1 w-full flex flex-col pt-4 ${isWide ? 'gap-1' : 'gap-6'}`}>
          <SidebarItem to="/Holad" icon={<Home size={isWide ? 20 : 22} className="flex-shrink-0" />} label="Главная" isWide={isWide} end />
          <SidebarItem to="/Holad/favorites" icon={<Heart size={isWide ? 20 : 22} className="flex-shrink-0" />} label="Избранное" isWide={isWide} />
          <SidebarItem to="/Holad/albums" icon={<Disc size={isWide ? 20 : 22} className="flex-shrink-0" />} label="Альбомы" isWide={isWide} />
          <SidebarItem to="/Holad/tracks" icon={<Music size={isWide ? 20 : 22} className="flex-shrink-0" />} label="Треки" isWide={isWide} />
          <SidebarItem to="/Holad/artists" icon={<Users size={isWide ? 20 : 22} className="flex-shrink-0" />} label="Артисты" isWide={isWide} />
          <SidebarItem to="/Holad/radio" icon={<Radio size={isWide ? 20 : 22} className="flex-shrink-0" />} label="Радио" isWide={isWide} />
        </div>
      </div>
      
      {/* Resizer */}
      <div 
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors z-20"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}

function SidebarItem({ to, icon, label, end, isWide }: { to: string, icon: React.ReactNode, label: string, end?: boolean, isWide: boolean }) {
  return (
    <NavLink 
      to={to}
      end={end}
      className={({ isActive }) => `w-full flex ${isWide ? 'flex-row items-center px-3 py-2.5 gap-3 rounded-lg' : 'flex-col items-center gap-1'} transition-colors group ${isActive ? (isWide ? 'bg-white/10 text-primary' : 'text-primary') : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
      title={label}
    >
      {({ isActive }) => (
        <>
          <div className={`relative flex justify-center ${!isWide ? 'w-full' : ''} ${isActive ? 'text-primary' : ''}`}>
            {!isWide && isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-md"></div>}
            {icon}
          </div>
          {isWide ? (
            <span className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
          ) : (
            <span className="text-[10px] font-bold leading-none mt-1 px-1 text-center truncate w-full">{label}</span>
          )}
        </>
      )}
    </NavLink>
  );
}
