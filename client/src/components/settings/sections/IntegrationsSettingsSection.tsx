import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import { pushIntegrations } from '../../../api/integrations';
import SettingSection from '../SettingSection';

export interface IntegrationsSettingsSectionProps {
  isMobile?: boolean;
  className?: string;
}

export default function IntegrationsSettingsSection({
  isMobile = false,
  className = '',
}: IntegrationsSettingsSectionProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  const [showLastFmKey, setShowLastFmKey] = useState(false);
  const [showYandexToken, setShowYandexToken] = useState(false);

  const titleNode = (
    <div className="flex items-center gap-2">
      <span>{t('settings.data_sources') || 'Источники информации (Data Sources)'}</span>
      <button
        onClick={() => window.location.reload()}
        className="p-1.5 rounded-full hover:bg-foreground/10 text-secondary hover:text-foreground transition-colors"
        title={t('common.refresh') || 'Refresh'}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {isMobile && (
        <div className="flex justify-end mb-[-0.5rem]">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/20 hover:bg-black/40 rounded-lg text-secondary hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
            <span className="text-xs">{t('common.refresh') || 'Обновить'}</span>
          </button>
        </div>
      )}

      <SettingSection title={isMobile ? (t('settings.data_sources') || 'Источники информации') : titleNode} isMobile={isMobile}>
        <div className="flex flex-col gap-4">
          {/* Navidrome / Subsonic */}
          <label className={`flex items-center ${isMobile ? 'justify-between bg-black/20 p-4 rounded-xl' : 'gap-3'} cursor-pointer group`}>
            <span className={`text-sm ${isMobile ? 'text-[15px] font-medium text-white' : 'group-hover:text-primary transition-colors'}`}>
              {t('settings.navidrome')}
            </span>
            <input
              type="checkbox"
              checked={settings.useNavidrome}
              onChange={(e) => settings.setUseNavidrome(e.target.checked)}
              className={`accent-primary ${isMobile ? 'w-6 h-6 flex-shrink-0' : 'w-4 h-4'} rounded cursor-pointer`}
            />
          </label>

          {/* Last.fm */}
          <label className={`flex items-center ${isMobile ? 'justify-between bg-black/20 p-4 rounded-xl' : 'gap-3'} cursor-pointer group`}>
            <span className={`text-sm ${isMobile ? 'text-[15px] font-medium text-white' : 'group-hover:text-primary transition-colors'}`}>
              {t('settings.lastfm')}
            </span>
            <input
              type="checkbox"
              checked={settings.useLastFm}
              onChange={(e) => {
                const checked = e.target.checked;
                settings.setUseLastFm(checked);
                pushIntegrations([
                  { integration_name: 'lastfm', token: settings.lastFmKey, enabled: checked },
                ]);
              }}
              className={`accent-primary ${isMobile ? 'w-6 h-6 flex-shrink-0' : 'w-4 h-4'} rounded cursor-pointer`}
            />
          </label>

          {settings.useLastFm && (
            <div className={isMobile ? 'bg-black/20 p-4 rounded-xl' : 'pl-7 relative'}>
              <div className="relative mb-2">
                <input
                  type={showLastFmKey ? 'text' : 'password'}
                  placeholder={t('settings.lastfm_key_placeholder') || 'Last.fm API Key'}
                  value={settings.lastFmKey}
                  onChange={(e) => settings.setLastFmKey(e.target.value)}
                  onBlur={() => {
                    pushIntegrations([
                      {
                        integration_name: 'lastfm',
                        token: settings.lastFmKey,
                        enabled: settings.useLastFm,
                      },
                    ]);
                  }}
                  className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm w-full outline-none focus:border-primary transition-colors text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowLastFmKey(!showLastFmKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-1"
                >
                  {showLastFmKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-secondary mt-1">
                {t('settings.lastfm_get_key_part1')}
                <a
                  href="https://www.last.fm/api/authentication"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {t('settings.lastfm_get_key_link')}
                </a>
                {t('settings.lastfm_get_key_part2')}
                <br />
                <span className="text-red-400 font-medium block mt-1">
                  {t('settings.lastfm_vpn_warning')}
                </span>
              </p>
            </div>
          )}

          {/* Yandex.Music */}
          <label className={`flex items-center ${isMobile ? 'justify-between bg-black/20 p-4 rounded-xl' : 'gap-3'} cursor-pointer group`}>
            <span className={`text-sm ${isMobile ? 'text-[15px] font-medium text-white' : 'group-hover:text-primary transition-colors'}`}>
              {t('settings.yandex_music')}
            </span>
            <input
              type="checkbox"
              checked={settings.useYandex}
              onChange={(e) => {
                const checked = e.target.checked;
                settings.setUseYandex(checked);
                pushIntegrations([
                  { integration_name: 'yandex', token: settings.yandexToken, enabled: checked },
                ]);
              }}
              className={`accent-primary ${isMobile ? 'w-6 h-6 flex-shrink-0' : 'w-4 h-4'} rounded cursor-pointer`}
            />
          </label>

          {settings.useYandex && (
            <div className={isMobile ? 'bg-black/20 p-4 rounded-xl' : 'pl-7 relative'}>
              <div className="relative mb-2">
                <input
                  type={showYandexToken ? 'text' : 'password'}
                  placeholder={t('settings.yandex_token_placeholder') || 'Yandex Token'}
                  value={settings.yandexToken}
                  onChange={(e) => settings.setYandexToken(e.target.value)}
                  onBlur={() => {
                    pushIntegrations([
                      {
                        integration_name: 'yandex',
                        token: settings.yandexToken,
                        enabled: settings.useYandex,
                      },
                    ]);
                  }}
                  className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm w-full outline-none focus:border-primary transition-colors text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowYandexToken(!showYandexToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-1"
                >
                  {showYandexToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-secondary mt-1">
                {t('settings.yandex_token_desc_part1')}
                <a
                  href="https://github.com/MarshalX/yandex-music-api/discussions/513"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {t('settings.yandex_token_desc_link')}
                </a>
                {t('settings.yandex_token_desc_part2')}
              </p>
            </div>
          )}
        </div>
      </SettingSection>
    </div>
  );
}
