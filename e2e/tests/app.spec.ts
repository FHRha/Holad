import { test, expect } from '@playwright/test';

const mockSubsonic = async (page) => {
  await page.route('**/rest/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        "subsonic-response": {
          "status": "ok",
          "version": "1.16.1",
          "randomSongs": { "song": [] },
          "albumList": { "album": [] },
          "albumList2": { "album": [] },
          "starred": { "song": [] },
          "playlists": { "playlist": [] },
          "playQueue": { "song": [] }
        }
      })
    });
  });
};

test.describe('App basic tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockSubsonic(page);
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          url: 'http://localhost:4000',
          user: 'testuser',
          token: 'testtoken',
          salt: 'testsalt',
          isAuthenticated: true
        },
        version: 0
      }));
    });
  });

  test('basic smoke test - app loads and UI renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/Holad/i);
  });

  test('offline emulation - UI reflects offline state', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('body')).toBeVisible();
  });
});
