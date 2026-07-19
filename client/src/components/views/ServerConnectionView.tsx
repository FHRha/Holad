import { useState } from 'react';
import { Server, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../common/LanguageSelector';

interface Props {
  onConnected: () => void;
}

export default function ServerConnectionView({ onConnected }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('https://');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!url) {
      setError(t('views.fill_all_fields'));
      return;
    }

    try {
      setLoading(true);
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
      
      let cleanUrl = parsed.origin + parsed.pathname;
      cleanUrl = cleanUrl.replace(/\/$/, '');
      const testUrl = cleanUrl.endsWith('/Holad') ? cleanUrl : `${cleanUrl}/Holad`;
      
      // Ping the server to check if Holad is running (Backwards compatible check)
      try {
        const response = await fetch(`${testUrl}/api/save-credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        // Our Holad server returns 400 'Missing fields' when body is empty.
        // Or 403 if bound to another server.
        // It should NOT return 404 (which means Not Found / not Holad)
        if (response.status !== 400 && response.status !== 403 && response.status !== 401 && !response.ok) {
          throw new Error('Not a Holad server');
        }
      } catch (err) {
        throw new Error('Server unreachable or not a Holad instance');
      }
      
      // Save it
      localStorage.setItem('holadServerUrl', cleanUrl);
      onConnected();
    } catch (err: any) {
      if (err.message === 'Invalid protocol') {
        setError('Invalid URL format. Example: https://holad.yourdomain.com');
      } else {
        setError(t('views.connection_failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden text-foreground">
      {/* Language Selector */}
      <div className="absolute top-4 right-4 z-50">
        <LanguageSelector />
      </div>
      {/* Abstract Background */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-[#4ade80]/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-blue-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl relative z-10 mx-4">
        <div className="text-center mb-6 md:mb-8">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-[#4ade80]/20">
            <Server className="text-black w-6 h-6 md:w-8 md:h-8" />
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2">{t('views.holad_connection_title')}</h1>
          <p className="text-sm text-secondary">
            {t('views.holad_connection_desc')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2 ml-1">{t('views.holad_url')}</label>
            <div className="relative">
              <Server size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type="url" 
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://holad.example.com"
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[#4ade80]/50 focus:ring-1 focus:ring-[#4ade80]/50 transition-all placeholder:text-white/20"
                required
              />
            </div>
            <p className="text-xs text-secondary mt-2 ml-1">
              {t('views.holad_connection_note')}
            </p>
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
            className="w-full bg-[#4ade80] hover:bg-[#22c55e] text-black font-bold py-3.5 rounded-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-6 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              t('views.holad_connect_btn')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
