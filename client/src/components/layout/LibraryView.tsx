import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import AlbumsView from '../views/AlbumsView';

export default function LibraryView() {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
      {/* Liquid Glass Top Navigation */}
      <div className="absolute top-4 left-4 right-4 z-50 bg-primary/10 backdrop-blur-2xl border border-primary/20 rounded-2xl shadow-lg shadow-primary/5 p-2 flex items-center justify-between overflow-x-auto hide-scrollbar gap-2">
        <NavTab to="/Holad/library/tracks" label="Песни" />
        <NavTab to="/Holad/library/albums" label="Альбомы" />
        <NavTab to="/Holad/library/artists" label="Исполнители" />
        <NavTab to="/Holad/library/playlists" label="Плейлисты" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/Holad/library/albums" replace />} />
          <Route path="/albums" element={<AlbumsView />} />
          {/* Other routes will be added later */}
          <Route path="*" element={<div className="p-8 text-center text-secondary">В разработке...</div>} />
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
