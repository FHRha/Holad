import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setPlatform, resetE2EHarness } from '../e2e/harness';
import { useDownloadStore, useDownloadProgressStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import { openExternalLink } from '../../utils/linkHelper';
import { exists } from '@tauri-apps/plugin-fs';

describe('Download Performance, IPC & Security Fixes', () => {
  beforeEach(() => {
    resetE2EHarness();
    useDownloadProgressStore.getState().clearAllProgress();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updateProgress updates useDownloadProgressStore without mutating useDownloadStore.downloads reference', () => {
    const store = useDownloadStore.getState();
    store.startDownload('perf-1', 'Perf Track', 'track');

    const downloadsRefBefore = useDownloadStore.getState().downloads;
    store.updateProgress('perf-1', 42, 420, 1000);
    store.updateCurrentTrack('perf-1', 'Movement II');
    const downloadsRefAfter = useDownloadStore.getState().downloads;

    expect(downloadsRefAfter).toBe(downloadsRefBefore);
    expect(useDownloadProgressStore.getState().progressById['perf-1']).toEqual({
      progress: 42,
      bytesDownloaded: 420,
      totalBytes: 1000,
      currentTrackName: 'Movement II',
    });

    store.completeDownload('perf-1', 'C:/Users/MockUser/Downloads/Holad/tracks/Perf Track.mp3');
    expect(useDownloadProgressStore.getState().progressById['perf-1']).toBeUndefined();
    expect(useDownloadStore.getState().downloads['perf-1'].progress).toBe(100);
  });

  it('StorageManager.getLocalCoverUri skips exists() on bare cover IDs without path separators', async () => {
    setPlatform('tauri');
    const existsSpy = vi.mocked(exists);
    existsSpy.mockClear();

    await StorageManager.getLocalCoverUri('cover-id-123');

    expect(existsSpy).not.toHaveBeenCalledWith('cover-id-123');
  });

  it('openExternalLink blocks non-http(s) protocols and passes noopener,noreferrer', async () => {
    setPlatform('web');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await openExternalLink('javascript:alert(1)');
    await openExternalLink('file:///etc/passwd');
    expect(openSpy).not.toHaveBeenCalled();

    await openExternalLink('https://github.com/FHRha/Holad');
    expect(openSpy).toHaveBeenCalledWith('https://github.com/FHRha/Holad', '_blank', 'noopener,noreferrer');
  });
});
