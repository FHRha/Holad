import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Eye, EyeOff, Gamepad2, Globe, Radio } from 'lucide-react';
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

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Discord Rich Presence Integration */}
      <SettingSection
        title="Discord Rich Presence"
        icon={<Gamepad2 size={16} />}
        description={t(
          'settings.discord_rpc_desc',
          'Отображение текущего трека в статусе профиля Discord'
        )}
        isMobile={isMobile}
      >
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-sm font-medium group-hover:text-primary transition-colors text-foreground">
              {t('settings.enable_discord_rpc', 'Транслировать статус в Discord')}
            </span>
            <input
              type="checkbox"
              checked={settings.enableDiscordRpc}
              onChange={(e) => settings.setEnableDiscordRpc(e.target.checked)}
              className="accent-primary w-4 h-4 rounded cursor-pointer"
            />
          </label>

          {settings.enableDiscordRpc && (
            <div className="pt-2 border-t border-border flex flex-col gap-1.5 animate-in fade-in duration-150">
              <label className="text-xs font-medium text-foreground">
                {t('settings.discord_client_id_label', 'Application ID (Client ID)')}
              </label>
              <input
                type="text"
                value={settings.discordClientId || ''}
                onChange={(e) => settings.setDiscordClientId(e.target.value)}
                placeholder="1165957668758900787 (По умолчанию / Feishin)"
                className="w-full px-3 py-1.5 text-xs bg-foreground/[0.04] border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors font-mono"
              />
              <p className="text-[11px] text-secondary leading-normal">
                {t(
                  'settings.discord_client_id_hint',
                  'По умолчанию используется общий Client ID. Чтобы в Discord отображалось «Слушает Holad», создайте приложение «Holad» на discord.com/developers/applications и вставьте его Application ID.'
                )}
              </p>
            </div>
          )}
        </div>
      </SettingSection>

      {/* 2. Data Sources & Music Providers */}
      <SettingSection
        title={
          <div className="flex items-center justify-between w-full">
            <span>{t('settings.data_sources') || 'Источники информации (Data Sources)'}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="p-1 rounded-lg hover:bg-foreground/10 text-secondary hover:text-foreground transition-colors ml-auto"
              title={t('common.refresh') || 'Refresh'}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        }
        icon={<Globe size={16} />}
        isMobile={isMobile}
      >
        <div className="flex flex-col gap-4">
          {/* Navidrome / Subsonic */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between cursor-pointer group">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-secondary group-hover:text-primary transition-colors" />
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                  {t('settings.navidrome', 'Navidrome / Subsonic API')}
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.useNavidrome}
                onChange={(e) => settings.setUseNavidrome(e.target.checked)}
                className="accent-primary w-4 h-4 rounded cursor-pointer"
              />
            </label>
            <p className="text-xs text-secondary/80 pl-5">
              {t('settings.navidrome_desc', 'Основной сервер каталога музыки и потокового воспроизведения')}
            </p>
          </div>

          <div className="h-[1px] w-full bg-border/40" />

          {/* Last.fm Scrobbling */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm font-medium group-hover:text-primary transition-colors">
                {t('settings.lastfm', 'Last.fm скробблинг')}
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
                className="accent-primary w-4 h-4 rounded cursor-pointer"
              />
            </label>

            {settings.useLastFm && (
              <div className="pt-2 space-y-2 animate-in fade-in">
                <div className="relative">
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
                    className="bg-foreground/[0.03] border border-border rounded-xl px-3.5 py-2 text-sm w-full outline-none focus:border-primary transition-colors text-foreground pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLastFmKey(!showLastFmKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors p-1"
                  >
                    {showLastFmKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  {t('settings.lastfm_get_key_part1', 'Получить API ключ можно на ')}
                  <a
                    href="https://www.last.fm/api/authentication"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    {t('settings.lastfm_get_key_link', 'сайте Last.fm')}
                  </a>
                  {t('settings.lastfm_get_key_part2', '')}
                  <span className="text-amber-400/90 font-medium block mt-1">
                    {t('settings.lastfm_vpn_warning', 'Для стабильной отправки скробблов может потребоваться доступ к API')}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="h-[1px] w-full bg-border/40" />

          {/* Yandex.Music */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm font-medium group-hover:text-primary transition-colors">
                {t('settings.yandex_music', 'Яндекс.Музыка (Интеграция метаданных)')}
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
                className="accent-primary w-4 h-4 rounded cursor-pointer"
              />
            </label>

            {settings.useYandex && (
              <div className="pt-2 space-y-2 animate-in fade-in">
                <div className="relative">
                  <input
                    type={showYandexToken ? 'text' : 'password'}
                    placeholder={t('settings.yandex_token_placeholder') || 'Yandex Music Token'}
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
                    className="bg-foreground/[0.03] border border-border rounded-xl px-3.5 py-2 text-sm w-full outline-none focus:border-primary transition-colors text-foreground pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowYandexToken(!showYandexToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors p-1"
                  >
                    {showYandexToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  {t('settings.yandex_token_desc_part1', 'Инструкция по извлечению OAuth токена доступна ')}
                  <a
                    href="https://github.com/MarshalX/yandex-music-api/discussions/513"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    {t('settings.yandex_token_desc_link', 'в руководстве Yandex Music API')}
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
