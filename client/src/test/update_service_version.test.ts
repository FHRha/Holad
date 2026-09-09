import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateService } from '../services/UpdateService';

describe('UpdateService Version Resolution', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    UpdateService.clearCachedVersion();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    UpdateService.clearCachedVersion();
  });

  it('should fetch version from server /api/version when in web mode', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ version: '2.0.6' })
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    const version = await UpdateService.getCurrentVersion();
    expect(version).toBe('2.0.6');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/version'),
      expect.any(Object)
    );
  });

  it('should cache version after first successful fetch', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ version: '2.0.6' })
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });
    global.fetch = fetchMock;

    const v1 = await UpdateService.getCurrentVersion();
    const v2 = await UpdateService.getCurrentVersion();

    expect(v1).toBe('2.0.6');
    expect(v2).toBe('2.0.6');
    // Fetch should only have been called once due to caching
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should fallback to compile-time version if server /api/version fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const version = await UpdateService.getCurrentVersion();
    // In test environment, __APP_VERSION__ is defined by Vite or falls back to '2.0.5'
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
