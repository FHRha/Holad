import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateService, compareVersions } from '../services/UpdateService';

describe('compareVersions SemVer', () => {
  it('should compare standard versions correctly', () => {
    expect(compareVersions('2.0.7', '2.0.6')).toBe(1);
    expect(compareVersions('2.0.6', '2.0.7')).toBe(-1);
    expect(compareVersions('v2.0.7', '2.0.7')).toBe(0);
    expect(compareVersions('2.1.0', '2.0.9')).toBe(1);
  });

  it('should prioritize stable releases over pre-releases of same core version', () => {
    expect(compareVersions('2.0.7', '2.0.7-test.1')).toBe(1);
    expect(compareVersions('2.0.7-test.1', '2.0.7')).toBe(-1);
    expect(compareVersions('2.0.7', '2.0.7-beta.1')).toBe(1);
  });

  it('should compare pre-release numbers correctly', () => {
    expect(compareVersions('2.0.7-test.2', '2.0.7-test.1')).toBe(1);
    expect(compareVersions('2.0.7-test.1', '2.0.7-test.2')).toBe(-1);
    expect(compareVersions('2.0.7-beta.1', '2.0.7-alpha.1')).toBe(1);
  });

  it('should correctly prioritize higher core version even if it is a pre-release', () => {
    expect(compareVersions('2.0.8-test.1', '2.0.7')).toBe(1);
    expect(compareVersions('2.0.7', '2.0.8-test.1')).toBe(-1);
  });
});

describe('UpdateService Version Resolution', () => {
  const originalGlobalFetch = global.fetch;
  const originalWindowFetch = typeof window !== 'undefined' ? window.fetch : undefined;

  beforeEach(() => {
    UpdateService.clearCachedVersion();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalGlobalFetch;
    if (typeof window !== 'undefined' && originalWindowFetch) {
      window.fetch = originalWindowFetch;
    }
    UpdateService.clearCachedVersion();
  });

  it('should fetch version from server /api/version when in web mode', async () => {
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
    if (typeof window !== 'undefined') window.fetch = fetchMock;

    const version = await UpdateService.getCurrentVersion();
    expect(version).toBe('2.0.6');
    expect(fetchMock).toHaveBeenCalledWith(
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
    if (typeof window !== 'undefined') window.fetch = fetchMock;

    const v1 = await UpdateService.getCurrentVersion();
    const v2 = await UpdateService.getCurrentVersion();

    expect(v1).toBe('2.0.6');
    expect(v2).toBe('2.0.6');
    // Fetch should only have been called once due to caching
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should fallback to compile-time version if server /api/version fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = fetchMock;
    if (typeof window !== 'undefined') window.fetch = fetchMock;

    const version = await UpdateService.getCurrentVersion();
    // In test environment, __APP_VERSION__ is defined by Vite or falls back to '2.0.5'
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
