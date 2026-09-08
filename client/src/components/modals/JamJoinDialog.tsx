import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Radio, ExternalLink, Globe } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { jamSocket } from '../../api/socket';

export default function JamJoinDialog() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = searchParams.get('room') || searchParams.get('jam') || '';
  const hostName = searchParams.get('host') || searchParams.get('user') || 'Friend';
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);

  const [alwaysOpen, setAlwaysOpen] = useState(
    () => localStorage.getItem('holad_always_open_app') === 'true'
  );

  useEffect(() => {
    if (alwaysOpen && roomId) {
      window.location.href = `holad://join?room=${encodeURIComponent(roomId)}`;
    }
  }, [alwaysOpen, roomId]);

  const handleAlwaysOpenToggle = (checked: boolean) => {
    setAlwaysOpen(checked);
    if (checked) {
      localStorage.setItem('holad_always_open_app', 'true');
    } else {
      localStorage.removeItem('holad_always_open_app');
    }
  };

  const handleOpenApp = () => {
    if (!roomId) return;
    window.location.href = `holad://join?room=${encodeURIComponent(roomId)}`;
  };

  const handleContinueInBrowser = () => {
    if (!roomId) {
      navigate('/Holad', { replace: true });
      return;
    }
    if (isAuthenticated) {
      jamSocket.joinRoom(roomId, typeof user === 'string' ? user : undefined);
      navigate('/Holad', { replace: true });
    } else {
      navigate(`/jam/?room=${encodeURIComponent(roomId)}`, { replace: true });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 text-foreground relative overflow-hidden flex flex-col items-center text-center">
        {/* Decorative background glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-4 shadow-lg ring-1 ring-primary/30">
          <Radio size={32} className="animate-pulse" />
        </div>

        <h2 className="text-xl font-bold tracking-tight mb-2">
          {t('deeplink.invite_title')}
        </h2>

        <p className="text-secondary text-sm mb-4 leading-relaxed">
          {t('deeplink.invite_desc', { name: hostName })}
        </p>

        {roomId && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/5 border border-border text-xs font-mono text-secondary mb-6">
            <span>Room:</span>
            <span className="font-semibold text-foreground">{roomId}</span>
          </div>
        )}

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleOpenApp}
            className="w-full py-3 px-4 bg-primary text-black font-bold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-primary/20 text-sm"
          >
            <ExternalLink size={18} />
            {t('deeplink.open_in_app')}
          </button>

          <button
            onClick={handleContinueInBrowser}
            className="w-full py-3 px-4 bg-foreground/10 hover:bg-foreground/15 text-foreground font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm border border-border/50"
          >
            <Globe size={18} />
            {t('deeplink.continue_in_browser')}
          </button>
        </div>

        <label className="flex items-center gap-2 mt-5 text-xs text-secondary cursor-pointer select-none hover:text-foreground transition-colors">
          <input
            type="checkbox"
            checked={alwaysOpen}
            onChange={(e) => handleAlwaysOpenToggle(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-foreground/5"
          />
          <span>{t('deeplink.always_open_app')}</span>
        </label>
      </div>
    </div>
  );
}
