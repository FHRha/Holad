import { useState, useMemo } from 'react';
import { useHistoryStore, getFilteredHistory, calculateStats } from '../../store/historyStore';
import { Clock, Play, Music, Users, Star, Flame, Calendar, Trophy, ChevronLeft, Disc } from 'lucide-react';
import TrackImage from '../common/TrackImage';
import ArtistLinks from '../common/ArtistLinks';
import ArtistAvatar from '../common/ArtistAvatar';
import Dropdown from '../common/Dropdown';
import { getCoverArtUrl } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import { useNavigate } from 'react-router-dom';

function formatDuration(seconds: number) {
  if (!seconds) return '0м';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}м`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}ч ${m}м`;
}

function timeAgo(timestamp: number) {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return 'Только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} минут назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} часов назад`;
  if (diff < 86400 * 2) return 'Вчера';
  return `${Math.floor(diff / 86400)} дней назад`;
}

const getImageUrl = (idOrUrl: string | undefined, size: number) => {
  if (!idOrUrl) return '';
  if (idOrUrl.startsWith('http')) return idOrUrl;
  return getCoverArtUrl(idOrUrl, size);
};

export default function HistoryView() {
  const history = useHistoryStore(s => s.history);
  const setQueueAndPlay = usePlayerStore(s => s.setQueueAndPlay);
  const navigate = useNavigate();

  const [period, setPeriod] = useState<number | null>(7); // null = all time
  const [topLimit, setTopLimit] = useState<number>(5);

  const filteredHistory = useMemo(() => getFilteredHistory(history, period), [history, period]);
  const stats = useMemo(() => calculateStats(filteredHistory), [filteredHistory]);

  const periods = [
    { label: '7 дней', value: 7 },
    { label: '30 дней', value: 30 },
    { label: '90 дней', value: 90 },
    { label: 'Всё время', value: null }
  ];

  return (
    <div className="flex flex-col p-6 overflow-y-auto w-full h-full text-white bg-background/50 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3 relative">
          <button onClick={() => navigate(-1)} className="md:hidden p-2 -ml-2 text-secondary hover:text-white transition-colors">
            <ChevronLeft size={28} />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-primary/20 hidden md:flex items-center justify-center text-primary shrink-0">
            <Clock size={28} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">История и Статистика</h1>
            <p className="text-secondary text-sm font-medium mt-1">Твоя личная аналитика прослушиваний</p>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-3 w-full md:w-auto">
          <Dropdown
            options={periods}
            value={period}
            onChange={(val) => setPeriod(val)}
            className="flex-1 md:w-40"
          />
          <Dropdown
            options={[5, 10, 20, 50].map(l => ({ label: `Топ ${l}`, value: l }))}
            value={topLimit}
            onChange={(val) => setTopLimit(val)}
            className="w-28 md:w-32 shrink-0"
          />
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <StatBlock icon={<Music size={24} />} value={stats.totalPlays} label="Треки" color="text-blue-400" bg="bg-blue-400/10" />
        <StatBlock icon={<Clock size={24} />} value={formatDuration(stats.totalListeningSeconds)} label="Время" color="text-primary" bg="bg-primary/10" />
        <StatBlock icon={<Users size={24} />} value={stats.uniqueArtists} label="Артисты" color="text-pink-400" bg="bg-pink-400/10" />
        <StatBlock icon={<Flame size={24} />} value={`${stats.streak} дн.`} label="Серия" color="text-orange-400" bg="bg-orange-400/10" />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Column: Top lists */}
        <div className="flex-[1.5] flex flex-col gap-8">
          
          <section className="bg-[#121212]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={20} className="text-yellow-500" />
              <h2 className="text-xl font-bold">Топ исполнителей</h2>
            </div>
            <div className="flex flex-col gap-3">
              {stats.topArtists.slice(0, topLimit).map((artist, i) => {
                const [artistId, artistName] = artist.key.includes('|||') ? artist.key.split('|||') : ['', artist.key];
                return (
                <div key={artist.key} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer" onClick={() => {
                  if (artistId) navigate(`/Holad/artist/${artistId}`);
                  else navigate(`/Holad/search?q=${encodeURIComponent(artistName)}`);
                }}>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-black text-white/20 w-6 text-center">{i + 1}</span>
                    <ArtistAvatar artistName={artistName} artistId={artistId} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0" fallbackSize={20} />
                    <span className="font-bold text-[15px]">{artistName}</span>
                  </div>
                  <span className="text-sm font-bold text-secondary bg-white/5 px-2.5 py-1 rounded-md">{artist.count} раз</span>
                </div>
                );
              })}
              {stats.topArtists.length === 0 && <span className="text-secondary text-sm">Нет данных за этот период</span>}
            </div>
          </section>

          <section className="bg-[#121212]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star size={20} className="text-primary" />
              <h2 className="text-xl font-bold">Топ треков</h2>
            </div>
            <div className="flex flex-col gap-2">
              {stats.topTracks.slice(0, topLimit).map((track, i) => {
                const [id, title, artist, coverArt] = track.key.split('|||');
                return (
                  <div key={id} className="flex items-center p-2 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => {
                    const t = filteredHistory.find(h => h.id === id);
                    if (t) setQueueAndPlay([t], 0);
                  }}>
                    <span className="text-xl font-black text-white/20 w-6 text-center mr-2">{i + 1}</span>
                    <TrackImage src={getImageUrl(coverArt, 100)} className="w-10 h-10 rounded-md mr-3 object-cover shadow-sm" alt={title} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-[15px] truncate">{title}</span>
                      <ArtistLinks artistString={artist} className="text-xs text-secondary truncate" />
                    </div>
                    <span className="text-sm font-bold text-secondary bg-white/5 px-2.5 py-1 rounded-md">{track.count} раз</span>
                  </div>
                );
              })}
              {stats.topTracks.length === 0 && <span className="text-secondary text-sm">Нет данных за этот период</span>}
            </div>
          </section>

          <section className="bg-[#121212]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Disc size={20} className="text-purple-400" />
              <h2 className="text-xl font-bold">Топ альбомов</h2>
            </div>
            <div className="flex flex-col gap-2">
              {stats.topAlbums.slice(0, topLimit).map((album, i) => {
                const [id, title, artist, coverArt] = album.key.split('|||');
                return (
                  <div key={id} className="flex items-center p-2 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => navigate(`/Holad/album/${id}`)}>
                    <span className="text-xl font-black text-white/20 w-6 text-center mr-2">{i + 1}</span>
                    <TrackImage src={getImageUrl(coverArt || id, 100)} className="w-10 h-10 rounded-md mr-3 object-cover shadow-sm" alt={title} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-[15px] truncate">{title}</span>
                      <ArtistLinks artistString={artist} className="text-xs text-secondary truncate" />
                    </div>
                    <span className="text-sm font-bold text-secondary bg-white/5 px-2.5 py-1 rounded-md">{album.count} раз</span>
                  </div>
                );
              })}
              {stats.topAlbums.length === 0 && <span className="text-secondary text-sm">Нет данных за этот период</span>}
            </div>
          </section>
        </div>

        {/* Right Column: History List */}
        <div className="flex-1 flex flex-col">
          <section className="bg-[#121212]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex-1 flex flex-col h-[600px]">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={20} className="text-green-400" />
              <h2 className="text-xl font-bold">Недавно играло</h2>
            </div>
            
            <div className="flex flex-col overflow-y-auto hide-scrollbar gap-1 pr-2">
              {filteredHistory.slice(0, 100).map((entry, idx) => (
                <div 
                  key={entry.playedAt.toString() + idx} 
                  className="flex items-center p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                  onClick={() => setQueueAndPlay([entry], 0)}
                >
                  <div className="relative w-12 h-12 mr-3 flex-shrink-0">
                    <TrackImage src={getImageUrl(entry.coverArt || entry.id, 100)} className="w-full h-full rounded-md object-cover" alt={entry.title} />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-md transition-opacity">
                      <Play fill="currentColor" size={20} className="text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-bold text-[14px] truncate">{entry.title}</span>
                    <ArtistLinks artistString={entry.artist} className="text-[12px] text-secondary truncate" />
                  </div>
                  <span className="text-[11px] font-medium text-secondary/60 whitespace-nowrap ml-2">
                    {timeAgo(entry.playedAt)}
                  </span>
                </div>
              ))}
              {filteredHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 text-secondary opacity-50 py-20">
                  <Clock size={48} className="mb-4" />
                  <span className="font-bold text-lg">История пуста</span>
                </div>
              )}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}

function StatBlock({ icon, value, label, color, bg }: { icon: React.ReactNode, value: string | number, label: string, color: string, bg: string }) {
  return (
    <div className="bg-[#121212]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-3 md:p-5 flex items-center gap-3 md:gap-4 hover:-translate-y-1 transition-transform">
      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full ${bg} ${color} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-lg md:text-2xl font-black leading-tight text-white">{value}</span>
        <span className="text-xs md:text-sm font-medium text-secondary truncate">{label}</span>
      </div>
    </div>
  );
}
