import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import AlbumsView from '../views/AlbumsView';
import TracksView from '../views/TracksView';
import ArtistsView from '../views/ArtistsView';
import PlaylistsView from '../views/PlaylistsView';
import { useTranslation } from 'react-i18next';
import { Search, CloudOff, Download, Heart, LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';

export default function LibraryView() {
  const { t } = useTranslation();
  const { setSearchOpen, activeFilter, setActiveFilter } = useUIStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const toggleFilter = (filter: string) => {
    setActiveFilter(activeFilter === filter ? null : filter);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-transparent md:bg-[#121212] overflow-hidden relative md:pb-0">
      {/* Desktop Liquid Glass Top Navigation */}
      <div className="hidden md:flex absolute top-4 left-4 right-4 z-50 bg-primary/10 backdrop-blur-2xl border border-primary/20 rounded-2xl shadow-lg shadow-primary/5 p-2 items-center justify-between overflow-x-auto hide-scrollbar gap-2">
        <NavTab to="/Holad/library/tracks" label={t('sidebar.tracks')} />
        <NavTab to="/Holad/library/albums" label={t('sidebar.albums')} />
        <NavTab to="/Holad/library/artists" label={t('sidebar.artists')} />
        <NavTab to="/Holad/library/playlists" label={t('sidebar.playlists')} />
      </div>

      {/* Mobile Top Section */}
      <div className="md:hidden px-4 pt-4 pb-2 shrink-0 bg-black/40 backdrop-blur-xl z-10 relative">
        <div 
          className="flex items-center bg-[#282828] rounded-xl px-3 py-2.5 mb-4 border border-white/5 cursor-text"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={20} className="text-[#b3b3b3] mr-2 pointer-events-none" />
          <div className="bg-transparent text-[#b3b3b3] outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
            {t('views.search_tracks', { defaultValue: 'Поиск...' })}
          </div>
        </div>
        <div className="flex items-center justify-between mb-4 relative">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar flex-1 pr-14" style={{ maskImage: 'linear-gradient(to right, black 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)' }}>
            <FilterChip icon={<CloudOff size={16} />} label={t('common.offline', { defaultValue: 'Офлайн' })} isActive={activeFilter === 'Offline'} onClick={() => toggleFilter('Offline')} />
            <FilterChip icon={<Download size={16} />} label={t('common.downloaded', { defaultValue: 'Загружено' })} isActive={activeFilter === 'Downloaded'} onClick={() => toggleFilter('Downloaded')} />
            <FilterChip icon={<Heart size={16} />} label={t('sidebar.favorites', { defaultValue: 'Избранное' })} isActive={activeFilter === 'Favorites'} onClick={() => toggleFilter('Favorites')} />
          </div>

          <button 
            onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
            className="absolute right-0 text-[#b3b3b3] hover:text-white transition-colors bg-[#282828] p-2 rounded-full z-10"
          >
            {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
          </button>
        </div>
        
        {/* Mobile Tabs */}
        <div className="flex bg-[#282828] rounded-2xl p-1 gap-1 overflow-x-auto hide-scrollbar">
          <MobileNavTab to="/Holad/library/tracks" label={t('sidebar.tracks')} />
          <MobileNavTab to="/Holad/library/albums" label={t('sidebar.albums')} />
          <MobileNavTab to="/Holad/library/artists" label={t('views.artists_short_tab', { defaultValue: 'Исполните...' })} />
          <MobileNavTab to="/Holad/library/playlists" label={t('common.playlists', { defaultValue: 'Плейлисты' })} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-[80px]">
        <Routes>
          <Route path="/" element={<Navigate to="/Holad/library/albums" replace />} />
          <Route path="/tracks" element={<TracksView />} />
          <Route path="/albums" element={<AlbumsView viewMode={viewMode} />} />
          <Route path="/artists" element={<ArtistsView />} />
          <Route path="/playlists" element={<PlaylistsView />} />
          {/* Other routes will be added later */}
          <Route path="*" element={<div className="p-8 text-center text-secondary">{t('common.in_development')}</div>} />
        </Routes>
      </div>
    </div>
  );
}

function NavTab({ to, label }: { to: string, label: string }) {
  return (
    <NavLink 
      to={to}
      className={({ isActive }) => `px-4 py-2 rounded-xl whitespace-nowrap text-sm font-semibold transition-all duration-300 ${isActive ? 'bg-primary text-background shadow-md' : 'text-primary/70 hover:text-primary hover:bg-primary/10'}`}
    >
      {label}
    </NavLink>
  );
}

function MobileNavTab({ to, label }: { to: string, label: string }) {
  return (
    <NavLink 
      to={to}
      className={({ isActive }) => `flex-1 px-3 py-2.5 rounded-xl whitespace-nowrap text-[14px] font-bold transition-colors text-center ${isActive ? 'bg-[#181818] text-white shadow-sm' : 'text-[#b3b3b3] hover:text-white'}`}
    >
      {label}
    </NavLink>
  );
}

function FilterChip({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-colors ${
        isActive ? 'bg-primary text-primary-foreground' : 'bg-[#282828] text-[#b3b3b3] hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
