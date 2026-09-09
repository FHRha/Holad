import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function TopNavigation() {
  const { t } = useTranslation();
  return (
    <div className="md:hidden sticky top-0 z-50 bg-background/95 backdrop-blur-md transform-gpu border-b border-border pt-4 pb-2">
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-4">
        <NavTab to="/tracks" label={t('sidebar.tracks')} />
        <NavTab to="/albums" label={t('sidebar.albums')} />
        <NavTab to="/artists" label={t('sidebar.artists')} />
        <NavTab to="/playlists" label={t('sidebar.playlists')} />
      </div>
    </div>
  );
}

function NavTab({ to, label }: { to: string, label: string }) {
  return (
    <NavLink 
      to={to}
      className={({ isActive }) => `px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold transition-colors ${isActive ? 'bg-foreground/10 text-foreground' : 'text-secondary hover:text-foreground'}`}
    >
      {label}
    </NavLink>
  );
}
