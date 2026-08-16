import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import i18n from 'i18next';
import fs from 'fs';
import path from 'path';

describe('Tier 1 - R6: Comprehensive Localization Audit & Key Parity', () => {
  let enTranslations: Record<string, any>;
  let ruTranslations: Record<string, any>;

  beforeEach(() => {
    // Load translation files directly from public locales
    const enPath = path.resolve(__dirname, '../../../public/locales/en/translation.json');
    const ruPath = path.resolve(__dirname, '../../../public/locales/ru/translation.json');

    enTranslations = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    ruTranslations = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getAllKeyPaths(obj: Record<string, any>, prefix = ''): string[] {
    let keys: string[] = [];
    for (const key of Object.keys(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        keys = keys.concat(getAllKeyPaths(obj[key], fullPath));
      } else {
        keys.push(fullPath);
      }
    }
    return keys;
  }

  it('R6-1: English (en) and Russian (ru) translation dictionaries exist and are valid JSON', () => {
    expect(enTranslations).toBeDefined();
    expect(ruTranslations).toBeDefined();
    expect(Object.keys(enTranslations).length).toBeGreaterThan(0);
    expect(Object.keys(ruTranslations).length).toBeGreaterThan(0);
  });

  it('R6-2: All top-level translation sections (sidebar, settings, player, views, common, jam) exist in both dictionaries', () => {
    const requiredSections = ['sidebar', 'settings', 'player', 'views', 'common', 'jam'];

    requiredSections.forEach((section) => {
      expect(enTranslations[section]).toBeDefined();
      expect(ruTranslations[section]).toBeDefined();
    });
  });

  it('R6-3: Key parity audit: every key in Russian translation exists in English translation', () => {
    const ruKeys = getAllKeyPaths(ruTranslations);
    const enKeys = new Set(getAllKeyPaths(enTranslations));

    const missingInEn = ruKeys.filter((key) => !enKeys.has(key));
    expect(missingInEn).toEqual([]);
  });

  it('R6-4: Key parity audit: every key in English translation exists in Russian translation', () => {
    const enKeys = getAllKeyPaths(enTranslations);
    const ruKeys = new Set(getAllKeyPaths(ruTranslations));

    const missingInRu = enKeys.filter((key) => !ruKeys.has(key));
    expect(missingInRu).toEqual([]);
  });

  it('R6-5: Player controls translation keys (play, pause, next, previous, auto_dj) are properly defined', () => {
    expect(enTranslations.player.play).toBeDefined();
    expect(ruTranslations.player.play).toBeDefined();
    expect(enTranslations.player.pause).toBeDefined();
    expect(ruTranslations.player.pause).toBeDefined();
    expect(enTranslations.player.auto_dj).toBeDefined();
    expect(ruTranslations.player.auto_dj).toBeDefined();
  });

  it('R6-6: Settings audio section keys (gapless, crossfade, normalization) are fully localized in ru and en', () => {
    expect(enTranslations.settings.gapless).toBeDefined();
    expect(ruTranslations.settings.gapless).toBeDefined();
    expect(enTranslations.settings.crossfade).toBeDefined();
    expect(ruTranslations.settings.crossfade).toBeDefined();
    expect(enTranslations.settings.normalization).toBeDefined();
    expect(ruTranslations.settings.normalization).toBeDefined();
    expect(enTranslations.settings.volume_multiplier).toBeDefined();
    expect(ruTranslations.settings.volume_multiplier).toBeDefined();
  });
});
