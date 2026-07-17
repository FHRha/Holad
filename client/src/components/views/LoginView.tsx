import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
// pingServer removed as it's no longer needed
import { Server, User, Lock, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import md5 from 'md5';

export default function LoginView() {
  const { t } = useTranslation();
  const [url, setUrl] = useState(useAuthStore.getState().url || 'https://');
  const [username, setUsername] = useState(useAuthStore.getState().user || '');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const { setCredentials, setAuthenticated } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!url || !username || !password) {
      setError(t('views.fill_all_fields'));
      return;
    }

    try {
      setLoading(true);
      const salt = Math.random().toString(36).substring(2, 15);
      const token = md5(password + salt);

      const proxyUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
      const response = await fetch(`${proxyUrl}/api/save-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, username, token, salt })
      });
      
      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      // If valid, save locally to Zustand store
      setCredentials(url, username, token, salt);
      
      setAuthenticated(true);
      navigate('/Holad', { replace: true });
    } catch (err: any) {
      console.error(err);
      setError(t('views.connection_failed'));
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-primary/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-blue-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl relative z-10 mx-4">
        <div className="text-center mb-6 md:mb-8">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-primary to-[#4ade80] rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
            <Server className="text-black w-6 h-6 md:w-8 md:h-8" />
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2">{t('views.login_system')}</h1>
          <p className="text-sm text-secondary">
            {t('views.login_supports')} {t('views.enter_server')}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2 ml-1">{t('views.server_url')}</label>
            <div className="relative">
              <Server size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type="url" 
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://navidrome.example.com"
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2 ml-1">{t('views.username')}</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t('views.username')}
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2 ml-1">{t('views.password')}</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-black font-bold py-3.5 rounded-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-6 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              t('views.login_btn')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
