import { useState } from 'react';
import { Link, LogOut, Shield, ShieldAlert, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { jamSocket } from '../../api/socket';
import { useAuthStore } from '../../store/authStore';
import { copyToClipboard } from '../../utils/clipboard';

export default function JamSessionControl({ hideCreate }: { hideCreate?: boolean }) {
  const { t } = useTranslation();
  const { roomId, role, participants } = usePlayerStore();
  const [copied, setCopied] = useState(false);

  const navigate = useNavigate();

  const handleCreate = () => {
    const { user } = useAuthStore.getState();
    jamSocket.createRoom(user || 'Host');
  };

  const handleLeave = () => {
    const isHost = usePlayerStore.getState().role === 'host';
    jamSocket.leaveRoom();
    
    // If listener, revert their memory state to their original saved localStorage state
    if (!isHost) {
      (usePlayerStore as any).persist?.rehydrate();
    }
    navigate('/Holad/');
  };

  const handleCopyLink = async () => {
    if (roomId) {
      const origin = window.location.origin;
      const url = new URL(`${origin}/jam/`);
      url.searchParams.set('room', roomId);
      await copyToClipboard(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!roomId) {
    if (hideCreate) return null;
    return (
      <div className="flex flex-col items-center justify-center gap-2 mt-4 text-secondary w-full">
        <button 
          onClick={handleCreate}
          className="w-full py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform"
        >
          {t('common.create_session')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Participants List */}
      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
        {participants.map((p) => (
          <div key={p.id} className="flex items-center justify-between bg-white/5 rounded-lg p-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.role === 'host' ? 'bg-primary' : p.role === 'cohost' ? 'bg-blue-400' : 'bg-secondary'}`} />
              <span className="text-sm font-medium text-foreground truncate" title={p.name}>{p.name}</span>
            </div>
            
            {role === 'host' && p.role !== 'host' && (
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button 
                  onClick={() => jamSocket.grantRole(p.id, p.role === 'cohost' ? 'listener' : 'cohost')}
                  className={`p-1.5 rounded-md transition-colors ${p.role === 'cohost' ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/40' : 'bg-white/5 text-secondary hover:text-white hover:bg-white/10'}`}
                  title={p.role === 'cohost' ? t('common.revoke_rights') : t('common.grant_rights')}
                >
                  {p.role === 'cohost' ? <ShieldAlert size={14} /> : <Shield size={14} />}
                </button>
                <button 
                  onClick={() => jamSocket.kickParticipant(p.id)}
                  className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  title={t('common.kick')}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="h-[1px] w-full bg-white/10 my-1" />

      {/* Controls */}
      <div className="flex flex-col gap-2 mt-2">
        <button 
          onClick={handleCopyLink}
          className={`w-full py-3 rounded-xl flex items-center justify-center gap-3 text-sm font-bold transition-colors ${copied ? 'bg-primary text-background' : 'bg-white/10 hover:bg-white/20 text-foreground'}`}
        >
          <Link size={18} />
          {copied ? t('common.copied') : t('common.copy_link')}
        </button>
        
        <button 
          onClick={handleLeave}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-3 text-sm font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
        >
          <LogOut size={18} />
          {t('common.leave_session')}
        </button>
      </div>
    </div>
  );
}
