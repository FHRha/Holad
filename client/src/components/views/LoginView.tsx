import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useDemoStore } from '../../store/demoStore';
// pingServer removed as it's no longer needed
import { Server, User, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import md5 from 'md5';
import { getHoladServerUrl } from '../../utils/serverConfig';
import { isTauri, isCapacitor } from '../../utils/StorageManager';
import LanguageSelector from '../common/LanguageSelector';
import ThemeSelector from '../common/ThemeSelector';

export default function LoginView() {
  const isDemoMode = useDemoStore(state => state.isDemoMode);
  if (isDemoMode) {
    return <Navigate to="/Holad" replace />;
  }

  const { t } = useTranslation();
  const [url, setUrl] = useState(useAuthStore.getState().url || 'https://');
  const [username, setUsername] = useState(useAuthStore.getState().user || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
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
      const cleanUsername = username.trim();
      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      const salt = Array.from(saltBytes, b => b.toString(16).padStart(2, '0')).join('');
      const token = md5(password + salt);

      const proxyUrl = getHoladServerUrl();
      const response = await fetch(`${proxyUrl}/api/save-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, username: cleanUsername, token, salt })
      });
      
      if (!response.ok) {
        let errorMsg = 'Invalid credentials';
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            if (errData.error) errorMsg = errData.error;
          } catch (e) {
            // If it's not JSON, use the raw text if it's not too long
            if (text && text.length < 200) {
              errorMsg = text;
            }
          }
        } catch(e) {}
        throw new Error(errorMsg);
      }

      // If valid, save locally to Zustand store
      setCredentials(url, cleanUsername, token, salt);
      
      setAuthenticated(true);
      navigate('/Holad', { replace: true });
    } catch (err: any) {
      console.error(err);
      setError(err.message || t('views.connection_failed'));
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Language & Theme Selectors */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <ThemeSelector />
        <LanguageSelector />
      </div>

      {/* Abstract Background */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-primary/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-blue-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-6 md:p-8 shadow-2xl relative z-10 mx-4">
        <div className="text-center mb-6 md:mb-8">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-primary to-[#4ade80] rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
            <Server className="text-black w-6 h-6 md:w-8 md:h-8" />
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">{t('views.login_system')}</h1>
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
                className="w-full bg-card border border-border rounded-xl py-3 pl-10 pr-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-foreground/20"
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
                className="w-full bg-card border border-border rounded-xl py-3 pl-10 pr-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-foreground/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2 ml-1">{t('views.password')}</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-card border border-border rounded-xl py-3 pl-10 pr-10 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-foreground/20"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors"
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
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
          
          {(isTauri() || isCapacitor()) && (
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('holadServerUrl');
                window.location.reload();
              }}
              className="w-full text-secondary hover:text-foreground text-sm font-medium py-2 transition-colors"
            >
              {t('views.change_server_btn')}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
