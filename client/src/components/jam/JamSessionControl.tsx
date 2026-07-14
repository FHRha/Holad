import { useState } from 'react';
import { Users, Link, LogOut } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { jamSocket } from '../../api/socket';

export default function JamSessionControl() {
  const { roomId, role } = usePlayerStore();
  const [copied, setCopied] = useState(false);

  const handleCreate = () => {
    jamSocket.createRoom();
  };

  const handleLeave = () => {
    jamSocket.leaveRoom();
  };

  const handleCopyLink = () => {
    if (roomId) {
      // Create shareable link pointing to /jam?room=XYZ
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!roomId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 mt-4 text-secondary">
        <button 
          onClick={handleCreate}
          className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors"
          title="Create Jam Session"
        >
          <Users size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 mt-4">
      <div className="w-10 h-10 rounded-full bg-primary/20 flex flex-col items-center justify-center text-primary border border-primary/30" title={`Room: ${roomId}`}>
        <Users size={16} />
      </div>
      
      {role === 'host' && (
        <button 
          onClick={handleCopyLink}
          className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-foreground flex items-center justify-center transition-colors"
          title={copied ? 'Copied!' : 'Copy Invite Link'}
        >
          <Link size={14} />
        </button>
      )}
      <button 
        onClick={handleLeave}
        className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors"
        title="Leave Session"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
