import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getLibraryCacheEpoch,
  invalidateLibraryCaches,
  subscribeLibraryInvalidation,
  checkLibraryScanUpdate,
  resetLibraryCacheState,
  LIBRARY_UPDATED_EVENT,
} from '../utils/libraryCache';
import * as subsonicIndex from '../api/subsonic/index';

describe('libraryCache & Subsonic scan helpers', () => {
  beforeEach(() => {
    resetLibraryCacheState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('increments cache epoch and notifies subscribers on holad:library-updated', () => {
    const initialEpoch = getLibraryCacheEpoch();
    const callback = vi.fn();
    const windowListener = vi.fn();

    const unsubscribe = subscribeLibraryInvalidation(callback);
    window.addEventListener(LIBRARY_UPDATED_EVENT, windowListener);

    const nextEpoch = invalidateLibraryCaches();
    expect(nextEpoch).toBe(initialEpoch + 1);
    expect(getLibraryCacheEpoch()).toBe(nextEpoch);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(windowListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    invalidateLibraryCaches();
    expect(callback).toHaveBeenCalledTimes(1);
    window.removeEventListener(LIBRARY_UPDATED_EVENT, windowListener);
  });

  it('invalidates caches when scanStatus.count changes and throttles checks within 5 minutes', async () => {
    const scanSpy = vi
      .spyOn(subsonicIndex, 'getScanStatus')
      .mockResolvedValueOnce({ scanning: false, count: 100 })
      .mockResolvedValueOnce({ scanning: false, count: 105 });

    // First check establishes baseline without invalidating
    const firstChanged = await checkLibraryScanUpdate(true);
    expect(firstChanged).toBe(false);
    expect(getLibraryCacheEpoch()).toBe(0);

    // Non-forced check within 5 minutes should be skipped
    const throttledChanged = await checkLibraryScanUpdate(false);
    expect(throttledChanged).toBe(false);
    expect(scanSpy).toHaveBeenCalledTimes(1);

    // Forced check sees new count -> invalidates cache
    const secondChanged = await checkLibraryScanUpdate(true);
    expect(secondChanged).toBe(true);
    expect(getLibraryCacheEpoch()).toBe(1);
  });

  it('calls startScan.view and getScanStatus.view via subsonic/index', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      expect(url).toMatch(/startScan\.view|getScanStatus\.view/);
      return new Response(
        JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            scanStatus: { scanning: true, count: 42 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const startRes = await subsonicIndex.startScan();
    expect(startRes).toEqual({
      scanning: true,
      count: 42,
      folderCount: undefined,
      lastScan: undefined,
    });

    const statusRes = await subsonicIndex.getScanStatus();
    expect(statusRes.scanning).toBe(true);
    expect(statusRes.count).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
