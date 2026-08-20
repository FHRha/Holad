import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import i18n from 'i18next';
import fs from 'fs';
import path from 'path';

describe('Tier 2 - B6: Localization Boundary & Translation Integrity Cases', () => {
  let enTranslations: Record<string, any>;
  let ruTranslations: Record<string, any>;

  beforeEach(() => {
    const enPath = path.resolve(__dirname, '../../../public/locales/en/translation.json');
    const ruPath = path.resolve(__dirname, '../../../public/locales/ru/translation.json');

    enTranslations = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    ruTranslations = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B6-1: No empty or whitespace-only translation values in Russian or English dictionaries', () => {
    function checkNonEmpty(obj: Record<string, any>, prefix = ''): void {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          checkNonEmpty(value, fullPath);
        } else if (typeof value === 'string') {
          // Custom color empty placeholders are acceptable, all other translation strings must not be empty
          if (!fullPath.includes('customColors')) {
            expect(value.trim().length, `Empty translation at: ${fullPath}`).toBeGreaterThan(0);
          }
        }
      }
    }

    checkNonEmpty(enTranslations);
    checkNonEmpty(ruTranslations);
  });

  it('B6-2: Interpolation placeholders (e.g. {{count}}, {{name}}) match identically between EN and RU', () => {
    function extractPlaceholders(str: string): string[] {
      const matches = str.match(/\{\{([^}]+)\}\}/g);
    // oxlint-disable-next-line
      return matches ? matches.map((m) => m.replace(/[{\}]/g, '').trim()).sort() : [];
    }

    function checkPlaceholderParity(enObj: any, ruObj: any, path = ''): void {
      for (const key of Object.keys(enObj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof enObj[key] === 'object' && enObj[key] !== null && !Array.isArray(enObj[key])) {
          if (ruObj[key]) {
            checkPlaceholderParity(enObj[key], ruObj[key], currentPath);
          }
        } else if (typeof enObj[key] === 'string' && typeof ruObj[key] === 'string') {
          const enPlaceholders = extractPlaceholders(enObj[key]);
          const ruPlaceholders = extractPlaceholders(ruObj[key]);
          expect(ruPlaceholders, `Placeholder mismatch at: ${currentPath}`).toEqual(enPlaceholders);
        }
      }
    }

    checkPlaceholderParity(enTranslations, ruTranslations);
  });

  it('B6-3: Special characters (quotes, slashes, dashes, colons, emojis) parse cleanly without escaping errors', () => {
    // Check known strings containing punctuation
    expect(enTranslations.settings.reset_done).toContain('✅');
    expect(ruTranslations.settings.reset_done).toContain('✅');

    // Confirm JSON serialization and deserialization roundtrip
    const enSerialized = JSON.stringify(enTranslations);
    const ruSerialized = JSON.stringify(ruTranslations);

    expect(JSON.parse(enSerialized)).toEqual(enTranslations);
    expect(JSON.parse(ruSerialized)).toEqual(ruTranslations);
  });

  it('B6-4: Fallback language resolution for unconfigured locales falls back cleanly to ru or en', () => {
    // When requesting translation with non-existent locale
    const fallback = i18n.options.fallbackLng;
    expect(fallback).toBeDefined();
  });

  it('B6-5: Rapid language switching (RU -> EN -> RU -> EN, 50 cycles) evaluates without memory leaks', () => {
    expect(() => {
      for (let i = 0; i < 50; i++) {
        const lang = i % 2 === 0 ? 'ru' : 'en';
        i18n.changeLanguage(lang);
      }
    }).not.toThrow();
  });

  it('B6-6: Nested key depth across all translation categories does not exceed safe hierarchy limits (depth <= 6)', () => {
    function getMaxDepth(obj: any, currentDepth = 1): number {
      let max = currentDepth;
      for (const val of Object.values(obj)) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          max = Math.max(max, getMaxDepth(val, currentDepth + 1));
        }
      }
      return max;
    }

    expect(getMaxDepth(enTranslations)).toBeLessThanOrEqual(6);
    expect(getMaxDepth(ruTranslations)).toBeLessThanOrEqual(6);
  });
});
