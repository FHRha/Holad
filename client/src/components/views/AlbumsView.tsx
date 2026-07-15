import { useEffect, useState } from 'react';
import { fetchAlbums } from '../../api/subsonic';
import { useTranslation } from 'react-i18next';
import AlbumCard from '../common/AlbumCard';

export default function AlbumsView() {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlbums().then(data => {
      setAlbums(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('views.loading_albums')}</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-card p-6 md:p-8">
      <h1 className="text-2xl font-bold mb-8 text-foreground hidden md:block">{t('views.albums')}</h1>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {albums.map(album => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </div>
    </div>
  );
}

