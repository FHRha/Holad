import { useEffect, useState, useMemo } from 'react';
import { getArtists } from '../../api/subsonic';
import ArtistCard from '../common/ArtistCard';
import { Search } from 'lucide-react';

export default function ArtistsView() {
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getArtists().then(data => {
      // data is an array of { id, name, albumCount, starred, ... }
      // The user wants artists sorted by importance (e.g. albums/tracks count)
      
      const sorted = [...data].sort((a, b) => {
        // First sort by starred
        if (a.starred && !b.starred) return -1;
        if (!a.starred && b.starred) return 1;
        
        // Then by album count (usually correlates with track count)
        const countA = a.albumCount || 0;
        const countB = b.albumCount || 0;
        if (countA !== countB) {
          return countB - countA;
        }
        
        // Finally by name
        return a.name.localeCompare(b.name);
      });
      
      setArtists(sorted);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const filteredArtists = useMemo(() => {
    if (!search.trim()) return artists;
    const lower = search.toLowerCase();
    return artists.filter(a => a.name.toLowerCase().includes(lower));
  }, [artists, search]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">Загрузка исполнителей...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-card custom-scrollbar relative pb-24">
      {/* Header section similar to Albums */}
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur p-6 pb-4 border-b border-white/5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Исполнители</h1>
        
        <div className="relative w-64 hidden sm:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input 
            type="text" 
            placeholder="Поиск исполнителя..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-white/30 focus:bg-black/80 transition-all"
          />
        </div>
      </div>
      
      <div className="p-6">
        {/* Mobile search */}
        <div className="relative w-full mb-6 sm:hidden">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input 
            type="text" 
            placeholder="Поиск исполнителя..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/30 transition-all"
          />
        </div>

        {filteredArtists.length === 0 ? (
          <div className="text-center text-secondary py-12">
            Исполнители не найдены
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6">
            {filteredArtists.map(artist => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
