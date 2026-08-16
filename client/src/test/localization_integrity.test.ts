import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import ruTranslation from '../../public/locales/ru/translation.json';
import enTranslation from '../../public/locales/en/translation.json';

function getFlatKeys(obj: any, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(getFlatKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

function getVal(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let curr = obj;
  for (const p of parts) {
    if (!curr || typeof curr !== 'object') return undefined;
    curr = curr[p];
  }
  return typeof curr === 'string' ? curr : undefined;
}

describe('Comprehensive Localization & 1:1 Parity (R6 & R8)', () => {
  it('has identical key count and 1:1 parity between RU and EN translation files', () => {
    const ruKeys = getFlatKeys(ruTranslation);
    const enKeys = getFlatKeys(enTranslation);

    expect(ruKeys.length).toBeGreaterThan(350);
    expect(ruKeys.length).toBe(enKeys.length);

    const ruSet = new Set(ruKeys);
    const enSet = new Set(enKeys);

    const missingInEn = ruKeys.filter(k => !enSet.has(k));
    const missingInRu = enKeys.filter(k => !ruSet.has(k));

    expect(missingInEn).toEqual([]);
    expect(missingInRu).toEqual([]);
  });

  it('contains no empty or whitespace-only translation strings', () => {
    const ruKeys = getFlatKeys(ruTranslation);
    for (const key of ruKeys) {
      const ruVal = getVal(ruTranslation, key);
      const enVal = getVal(enTranslation, key);

      expect(ruVal, `Empty RU translation for key: ${key}`).toBeDefined();
      expect(ruVal!.trim().length, `Whitespace-only RU translation for key: ${key}`).toBeGreaterThan(0);

      expect(enVal, `Empty EN translation for key: ${key}`).toBeDefined();
      expect(enVal!.trim().length, `Whitespace-only EN translation for key: ${key}`).toBeGreaterThan(0);
    }
  });

  it('contains all 35 missing survey keys from R6 specification in both locales', () => {
    const surveyKeys = [
      'settings.desktop',
      'settings.run_on_startup',
      'settings.start_minimized',
      'settings.close_to_tray',
      'settings.gapless',
      'settings.gapless_desc',
      'settings.normalization',
      'settings.normalization_desc',
      'settings.crossfade',
      'settings.crossfade_desc',
      'settings.crossfade_duration',
      'settings.crossfade_curve',
      'settings.curve_equal_power',
      'settings.curve_linear',
      'settings.prebuffering',
      'settings.preload_desc',
      'settings.volume_multiplier',
      'settings.select_download_folder',
      'common.seconds_short',
      'settings.error_get_path',
      'common.no_track',
      'player.pause',
      'player.play',
      'player.next',
      'player.previous',
      'common.in_favorites',
      'common.add_favorite',
      'common.show_app',
      'common.quit',
      'common.remove_download',
      'sidebar.playlists',
      'views.artists_not_found',
      'views.no_track_data',
      'views.no_albums',
      'views.multiplier_value',
    ];

    for (const key of surveyKeys) {
      const ruVal = getVal(ruTranslation, key);
      const enVal = getVal(enTranslation, key);

      expect(ruVal, `Survey key missing in RU: ${key}`).toBeTruthy();
      expect(enVal, `Survey key missing in EN: ${key}`).toBeTruthy();
    }
  });

  it('contains all extracted hardcoded string keys in both locales', () => {
    const extractedKeys = [
      'views.album',
      'views.track',
      'views.download_error',
      'views.change_server_btn',
      'common.error_boundary_title',
      'common.error_boundary_desc',
      'common.error_boundary_reload',
      'player.provided_by_server',
      'player.title',
      'player.time',
      'player.queue_is_empty',
      'common.music',
    ];

    for (const key of extractedKeys) {
      const ruVal = getVal(ruTranslation, key);
      const enVal = getVal(enTranslation, key);

      expect(ruVal, `Extracted key missing in RU: ${key}`).toBeTruthy();
      expect(enVal, `Extracted key missing in EN: ${key}`).toBeTruthy();
    }
  });

  it('switches languages cleanly via i18n.changeLanguage and translates keys properly', async () => {
    await i18n.changeLanguage('ru');
    expect(i18n.language).toBe('ru');
    expect(i18n.t('settings.desktop')).toBe('Десктоп');
    expect(i18n.t('settings.gapless')).toBe('Бесшовное воспроизведение (Gapless)');
    expect(i18n.t('player.pause')).toBe('Пауза');
    expect(i18n.t('player.title')).toBe('Название');
    expect(i18n.t('common.error_boundary_title')).toBe('Что-то пошло не так');

    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('settings.desktop')).toBe('Desktop');
    expect(i18n.t('settings.gapless')).toBe('Gapless playback');
    expect(i18n.t('player.pause')).toBe('Pause');
    expect(i18n.t('player.title')).toBe('Title');
    expect(i18n.t('common.error_boundary_title')).toBe('Something went wrong');

    // Switch back to default
    await i18n.changeLanguage('ru');
  });
});
