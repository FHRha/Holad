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

  it('should handle multi-digit (>= 10) and up to 3 digits (XXX.YYY.ZZZ) in core versions', () => {
    expect(compareVersions('2.1.10', '2.1.9')).toBe(1);
    expect(compareVersions('2.1.9', '2.1.10')).toBe(-1);
    expect(compareVersions('2.10.0', '2.9.9')).toBe(1);
    expect(compareVersions('10.0.0', '9.9.9')).toBe(1);
    expect(compareVersions('100.200.300', '100.200.299')).toBe(1);
    expect(compareVersions('999.999.999', '999.999.998')).toBe(1);
    expect(compareVersions('999.999.999', '999.999.999')).toBe(0);
  });

  it('should handle multi-digit (>= 10 and 3 digits) in pre-release versions without lexicographical bugs', () => {
    expect(compareVersions('2.1.5-test.10', '2.1.5-test.9')).toBe(1);
    expect(compareVersions('2.1.5-test.10', '2.1.5-test.2')).toBe(1);
    expect(compareVersions('2.1.5-test.10', '2.1.5-test.1')).toBe(1);
    expect(compareVersions('2.1.5-test.11', '2.1.5-test.10')).toBe(1);
    expect(compareVersions('2.1.5-test.100', '2.1.5-test.99')).toBe(1);
    expect(compareVersions('2.1.5-test.999', '2.1.5-test.998')).toBe(1);
  });

  it('should handle zero-padded pre-release numbers and natural token formats', () => {
    expect(compareVersions('2.1.5-test.010', '2.1.5-test.009')).toBe(1);
    expect(compareVersions('2.1.5-test.010', '2.1.5-test.9')).toBe(1);
    expect(compareVersions('2.1.5-test.001', '2.1.5-test.2')).toBe(-1);
    expect(compareVersions('2.1.5-test10', '2.1.5-test9')).toBe(1);
    expect(compareVersions('2.1.5-test10', '2.1.5-test2')).toBe(1);
    expect(compareVersions('2.1.5-test-10', '2.1.5-test-9')).toBe(1);
    expect(compareVersions('2.1.5-beta.10', '2.1.5-beta.2')).toBe(1);
  });

  it('should correctly sort GitHub releases list even when GitHub returns test.10 below test.2', () => {
    const rawGithubTags = [
      'v2.1.5-test.9',
      'v2.1.5-test.8',
      'v2.1.5-test.7',
      'v2.1.5-test.6',
      'v2.1.5-test.5',
      'v2.1.5-test.4',
      'v2.1.5-test.3',
      'v2.1.5-test.2',
      'v2.1.5-test.10',
      'v2.1.5-test.1',
      'v2.1.4'
    ];

    const sorted = [...rawGithubTags].sort((a, b) => compareVersions(b, a));
    expect(sorted[0]).toBe('v2.1.5-test.10');
    expect(sorted[1]).toBe('v2.1.5-test.9');
    expect(sorted[sorted.length - 1]).toBe('v2.1.4');
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
