import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import GenreCarousel from '../../components/layout/GenreCarousel';
import { useSettingsStore } from '../../store/settingsStore';
import { applyAppIcon } from '../../utils/appIconHelper';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (k: string) => k,
    }),
  };
});

vi.mock('../../api/subsonic', () => ({
  getSongsByGenre: vi.fn(),
  getCoverArtUrl: vi.fn(() => 'mock-cover'),
}));

vi.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

vi.mock('../../store/downloadStore', () => ({
  getOfflineTracks: vi.fn(() => []),
}));

describe('Genre Carousel & App Icon Features', () => {
  beforeEach(() => {
    document.head.innerHTML = '<link rel="icon" href="/icons/favicon_dark.png" />';
  });

  describe('GenreCarousel text color in light/dark themes', () => {
    it('renders genre cards with text-white and text-white/80 regardless of light/dark theme', () => {
      const mockGenres = [
        { value: 'Rock', songCount: 42 },
        { value: 'Electronic', songCount: 15 },
      ];

      const { container } = render(<GenreCarousel title="Genre Radio" genres={mockGenres} />);

      const titleElements = container.querySelectorAll('h3');
      expect(titleElements.length).toBe(2);
      titleElements.forEach((el) => {
        expect(el.className).toContain('text-white');
        expect(el.className).not.toContain('text-foreground');
      });

      const trackCounts = container.querySelectorAll('p.text-xs');
      expect(trackCounts.length).toBe(2);
      trackCounts.forEach((el) => {
        expect(el.className).toContain('text-white/80');
        expect(el.className).not.toContain('text-foreground');
      });
    });
  });

  describe('Dynamic App Icon & Theme Switching', () => {
    it('updates appIcon to wave_light when theme switches to light, and wave_dark when dark', () => {
      useSettingsStore.setState({ theme: 'dark', appIcon: 'wave_dark' });

      useSettingsStore.getState().setTheme('light');
      expect(useSettingsStore.getState().theme).toBe('light');
      expect(useSettingsStore.getState().appIcon).toBe('wave_light');

      useSettingsStore.getState().setTheme('dark');
      expect(useSettingsStore.getState().theme).toBe('dark');
      expect(useSettingsStore.getState().appIcon).toBe('wave_dark');
    });

    it('preserves cassette icon when theme changes between light and dark', () => {
      useSettingsStore.getState().setAppIcon('cassette');
      expect(useSettingsStore.getState().appIcon).toBe('cassette');

      useSettingsStore.getState().setTheme('light');
      expect(useSettingsStore.getState().appIcon).toBe('cassette');

      useSettingsStore.getState().setTheme('dark');
      expect(useSettingsStore.getState().appIcon).toBe('cassette');
    });

    it('updates browser favicon element on applyAppIcon call', async () => {
      await applyAppIcon('wave_light');
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      expect(link?.href).toContain('/icons/favicon_light.png');

      await applyAppIcon('cassette');
      link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      expect(link?.href).toContain('/icons/logo_cassette.png');

      await applyAppIcon('wave_dark');
      link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      expect(link?.href).toContain('/icons/favicon_dark.png');
    });
  });
});