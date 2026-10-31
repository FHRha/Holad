import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UsersRound, Radio, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import JamSessionControl from '../jam/JamSessionControl';
import { SocialPanel, AudioModeToggle, useSocialState } from '../social';

export default function FriendsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'friends' | 'jam'>('friends');
  const { friends, hasNotifications, audioMode, setAudioMode, roomId } = useSocialState();

  return (
    <div className="flex-1 overflow-y-auto bg-transparent md:bg-background custom-scrollbar pb-32 md:pb-12">
      <div className="px-4 pt-4 pb-2 md:px-8 md:pt-8 md:pb-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="md:hidden p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
              {t('social.tab_friends', 'Jam & Друзья')}
            </h1>
            <p className="text-xs md:text-sm text-secondary">
              {t('social.friends_listen_together', 'Слушайте музыку вместе с друзьями в реальном времени')}
            </p>
          </div>
        </div>

        <div className="flex max-w-md bg-card border border-border p-1 rounded-2xl gap-1">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
              activeTab === 'friends'
                ? 'bg-primary text-black shadow-md'
                : 'text-secondary hover:text-foreground'
            }`}
          >
            <UsersRound size={16} />
            <span>{t('social.tab_friends_button', 'Друзья')}</span>
            {friends.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'friends' ? 'bg-black/20 text-black' : 'bg-foreground/10 text-secondary'
              }`}>
                {friends.length}
              </span>
            )}
            {hasNotifications && (
              <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-card animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('jam')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
              activeTab === 'jam'
                ? 'bg-primary text-black shadow-md'
                : 'text-secondary hover:text-foreground'
            }`}
          >
            <Radio size={16} />
            <span>{t('social.tab_jam', 'Jam-сессия')}</span>
            {roomId && (
              <span className="w-2 h-2 rounded-full bg-green-400 ring-2 ring-card animate-pulse" />
            )}
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 max-w-3xl space-y-4 pt-2">
        {activeTab === 'friends' ? (
          <SocialPanel variant="view" onAcceptJamInvite={() => setActiveTab('jam')} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 bg-card border border-border rounded-2xl p-4 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
                {t('social.mode_jam_playback', 'Режим воспроизведения Jam')}
              </span>
              <AudioModeToggle audioMode={audioMode} onSetAudioMode={setAudioMode} variant="view" />
            </div>

            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
              <JamSessionControl />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
