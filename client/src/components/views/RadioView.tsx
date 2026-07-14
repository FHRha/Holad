import { useState, useEffect } from 'react';
import { Play, Shuffle, Heart, Disc, Music, Loader2 } from 'lucide-react';
import { fetchRandomTracks, getStarred, getGenres, getSongsByGenre, getCoverArtUrl } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';

export default function RadioView() {
  const [genres, setGenres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStation, setLoadingStation] = useState<string | null>(null);
  
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);

  useEffect(() => {
    loadGenres();
  }, []);

  const loadGenres = async () => {
    try {
      const data = await getGenres();
      // get the top 12 genres to not overwhelm the UI
      setGenres((data || []).slice(0, 12));
    } catch (e) {
      console.error('Error fetching genres:', e);
    } finally {
      setLoading(false);
    }
  };

  const mapTracks = (tracks: any[]): Track[] => {
    return tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
      duration: t.duration,
      userRating: t.userRating
    }));
  };

  const startStation = async (id: string, fetchFn: () => Promise<any[]>) => {
    setLoadingStation(id);
    try {
      const tracks = await fetchFn();
      if (tracks && tracks.length > 0) {
        setQueueAndPlay(mapTracks(tracks), 0);
      } else {
        alert("Не удалось загрузить треки для этой станции.");
      }
    } catch (error) {
      console.error(error);
      alert("Ошибка при запуске станции.");
    } finally {
      setLoadingStation(null);
    }
  };

  const startRandomRadio = () => startStation('random', () => fetchRandomTracks(50));
  
  const startFavoritesRadio = () => startStation('favorites', async () => {
    const tracks = await getStarred();
    return tracks.sort(() => Math.random() - 0.5);
  });

  const startNewReleases = () => startStation('newest', async () => {
    return fetchRandomTracks(50);
  });

  const startGenreRadio = (genreName: string) => startStation(`genre-${genreName}`, () => getSongsByGenre(genreName, 50));

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary"><Loader2 className="animate-spin w-8 h-8" /></div>;
  }

  const StationCard = ({ id, title, icon: Icon, description, onClick, colorClass }: any) => {
    const isThisLoading = loadingStation === id;
    
    return (
      <div 
        onClick={isThisLoading ? undefined : onClick}
        className={`relative overflow-hidden rounded-xl cursor-pointer group transition-all duration-300 hover:scale-105 hover:shadow-2xl ${colorClass}`}
      >
        <div className="absolute -bottom-6 -right-6 transform rotate-12 opacity-30 group-hover:opacity-40 transition-opacity">
          <Icon size={120} className="text-black drop-shadow-lg" />
        </div>
        
        <div className="relative z-10 p-5 flex flex-col h-full min-h-[160px] justify-between">
          <h3 className="text-2xl font-black text-white drop-shadow-md leading-tight line-clamp-2">{title}</h3>
          
          <div className="flex flex-col gap-4">
            <p className="text-sm text-white/80 font-bold drop-shadow-md line-clamp-2">{description}</p>
            <div className="flex justify-end">
              <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-4 group-hover:translate-y-0 shadow-xl">
                {isThisLoading ? <Loader2 size={24} className="animate-spin text-black" /> : <Play size={24} fill="currentColor" className="ml-1 text-black" />}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar pt-10">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Main Stations */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-6">Основные Станции</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StationCard 
              id="random"
              title="Бесконечный Микс" 
              description="Случайные треки из вашей библиотеки."
              icon={Shuffle}
              onClick={startRandomRadio}
              colorClass="bg-[#1E3264]"
            />
            <StationCard 
              id="favorites"
              title="Микс из Любимых" 
              description="Треки, которым вы поставили лайк."
              icon={Heart}
              onClick={startFavoritesRadio}
              colorClass="bg-[#E8115B]"
            />
            <StationCard 
              id="newest"
              title="Свежая Кровь" 
              description="Случайные треки из новых поступлений."
              icon={Disc}
              onClick={startNewReleases}
              colorClass="bg-[#148A08]"
            />
          </div>
        </section>

        {/* Genre Stations */}
        {genres.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-foreground mb-6">Радио по жанрам</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {genres.map((genre: any, idx: number) => {
                const spotifyColors = [
                  'bg-[#E13300]', 'bg-[#1E3264]', 'bg-[#E8115B]', 'bg-[#148A08]', 
                  'bg-[#509BF5]', 'bg-[#FF4632]', 'bg-[#BA5D07]', 'bg-[#7358FF]', 
                  'bg-[#8D67AB]', 'bg-[#477D95]', 'bg-[#E1118C]', 'bg-[#006450]'
                ];
                const colorClass = spotifyColors[idx % spotifyColors.length];
                
                return (
                  <StationCard 
                    key={genre.value}
                    id={`genre-${genre.value}`}
                    title={genre.value} 
                    description={`${genre.songCount} треков`}
                    icon={Music}
                    onClick={() => startGenreRadio(genre.value)}
                    colorClass={colorClass}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
