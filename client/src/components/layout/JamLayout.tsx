import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { jamSocket } from '../../api/socket';
import { usePlayerStore } from '../../store/playerStore';
import JamSessionControl from '../jam/JamSessionControl';
import ListenerView from '../jam/ListenerView';

export default function JamLayout() {
  const [searchParams] = useSearchParams();
  const roomToJoin = searchParams.get('room');
  const trackId = searchParams.get('track');
  const role = usePlayerStore(state => state.role);

  useEffect(() => {
    // If it's a room, connect to socket
    if (roomToJoin) {
      jamSocket.connect();
      return () => { jamSocket.disconnect(); };
    }
  }, [roomToJoin]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans items-center justify-center p-8 relative">
      {/* Dynamic background could go here */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-background opacity-50" />
      
      <div className="relative z-10 w-full max-w-4xl bg-card border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col h-full max-h-[800px]">
        {roomToJoin ? (
          role === 'host' ? <JamSessionControl /> : <ListenerView />
        ) : trackId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <h2 className="text-2xl font-bold mb-4">Временная ссылка</h2>
            <p className="text-secondary mb-8">Плеер трека {trackId} загружается...</p>
            {/* Minimal Track Player goes here */}
            <ListenerView trackId={trackId} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-secondary">
            Неверная ссылка
          </div>
        )}
      </div>
    </div>
  );
}
