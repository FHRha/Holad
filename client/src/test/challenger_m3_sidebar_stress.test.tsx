import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  resetE2EHarness,
  setPlatform,
} from './e2e/harness';
import {
  useDownloadStore,
  getDownloadQueueStats,
  DownloadItem,
} from '../store/downloadStore';
import { useUIStore } from '../store/uiStore';
import Sidebar from '../components/layout/Sidebar';

describe('Adversarial Stress Test: Sidebar Queue UI, State Transitions & Calculations', () => {
  beforeEach(() => {
    resetE2EHarness();
    setPlatform('tauri');
    useUIStore.setState({ leftSidebarWidth: 150 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Extreme Values, Invalid Inputs & Boundary Calculations
  // ==========================================================================
  describe('Suite 1: Extreme Values & Boundary Math in Queue Progress', () => {
    it('handles empty, null, or corrupted download objects gracefully', () => {
      const statsEmpty = getDownloadQueueStats({});
      expect(statsEmpty.isDownloading).toBe(false);
      expect(statsEmpty.activeDownloadsCount).toBe(0);
      expect(statsEmpty.queuedCount).toBe(0);
      expect(statsEmpty.totalActiveCount).toBe(0);
      expect(statsEmpty.overallProgress).toBe(0);

      // Nullish input fallback
      const statsNull = getDownloadQueueStats(null as any);
      expect(statsNull.isDownloading).toBe(false);
      expect(statsNull.activeDownloadsCount).toBe(0);
      expect(statsNull.overallProgress).toBe(0);
    });

    it('calculates exact progress at boundaries: 0%, 100%, and intermediate fractions', () => {
      const downloads: Record<string, DownloadItem> = {
        d0: { id: 'd0', name: 'Zero', type: 'track', status: 'downloading', progress: 0, path: '', timestamp: 1 },
        d100: { id: 'd100', name: 'Full', type: 'track', status: 'downloading', progress: 100, path: '', timestamp: 2 },
      };

      const stats = getDownloadQueueStats(downloads);
      expect(stats.isDownloading).toBe(true);
      expect(stats.activeDownloadsCount).toBe(2);
      expect(stats.overallProgress).toBe(50); // (0 + 100) / 2 = 50
    });

    it('handles undefined, NaN, negative, and over-100 progress values without NaN corruption', () => {
      const downloads: Record<string, DownloadItem> = {
        dUndef: { id: 'dUndef', name: 'Undef', type: 'track', status: 'downloading', progress: undefined as any, path: '', timestamp: 1 },
        dNaN: { id: 'dNaN', name: 'NaN', type: 'track', status: 'downloading', progress: NaN as any, path: '', timestamp: 2 },
        dNeg: { id: 'dNeg', name: 'Neg', type: 'track', status: 'downloading', progress: -50, path: '', timestamp: 3 },
        dOver: { id: 'dOver', name: 'Over', type: 'track', status: 'downloading', progress: 150, path: '', timestamp: 4 },
      };

      const stats = getDownloadQueueStats(downloads);
      expect(stats.isDownloading).toBe(true);
      expect(stats.activeDownloadsCount).toBe(4);
      expect(Number.isFinite(stats.overallProgress)).toBe(true);
      expect(isNaN(stats.overallProgress)).toBe(false);
    });

    it('correctly rounds high-precision floating point averages to integer', () => {
      const downloads: Record<string, DownloadItem> = {
        d1: { id: 'd1', name: 'Float 1', type: 'track', status: 'downloading', progress: 33.333333333333, path: '', timestamp: 1 },
        d2: { id: 'd2', name: 'Float 2', type: 'track', status: 'downloading', progress: 33.333333333333, path: '', timestamp: 2 },
        d3: { id: 'd3', name: 'Float 3', type: 'track', status: 'downloading', progress: 33.333333333333, path: '', timestamp: 3 },
      };

      const stats = getDownloadQueueStats(downloads);
      expect(stats.overallProgress).toBe(33); // Math.round(99.999999999999 / 3) = 33
    });

    it('ensures overallProgress is 0 when only queued or paused items exist (zero-division guard)', () => {
      const downloads: Record<string, DownloadItem> = {
        q1: { id: 'q1', name: 'Queued 1', type: 'track', status: 'queued', progress: 0, path: '', timestamp: 1 },
        q2: { id: 'q2', name: 'Queued 2', type: 'track', status: 'queued', progress: 0, path: '', timestamp: 2 },
        p1: { id: 'p1', name: 'Paused 1', type: 'track', status: 'paused', progress: 50, path: '', timestamp: 3 },
      };

      const stats = getDownloadQueueStats(downloads);
      expect(stats.isDownloading).toBe(false);
      expect(stats.activeDownloadsCount).toBe(0);
      expect(stats.queuedCount).toBe(2);
      expect(stats.totalActiveCount).toBe(2);
      expect(stats.overallProgress).toBe(0);
      expect(isNaN(stats.overallProgress)).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 2: Rapid & Chaotic State Transitions
  // ==========================================================================
  describe('Suite 2: Rapid State Transitions & Lifecycle Stress', () => {
    it('accurately tracks rapid full lifecycle: queued -> downloading -> paused -> resumed -> completed', () => {
      const store = useDownloadStore.getState();
      const trackId = 'stress-track-1';

      // 1. Queue
      store.queueDownload(trackId, 'Rapid Track', 'track');
      let stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.isDownloading).toBe(false);
      expect(stats.queuedCount).toBe(1);
      expect(stats.activeDownloadsCount).toBe(0);

      // 2. Start Downloading
      store.resumeDownload(trackId);
      store.updateProgress(trackId, 25);
      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.isDownloading).toBe(true);
      expect(stats.queuedCount).toBe(0);
      expect(stats.activeDownloadsCount).toBe(1);
      expect(stats.overallProgress).toBe(25);

      // 3. Pause
      store.pauseDownload(trackId);
      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.isDownloading).toBe(false);
      expect(stats.activeDownloadsCount).toBe(0);

      // 4. Resume
      store.resumeDownload(trackId);
      store.updateProgress(trackId, 75);
      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.isDownloading).toBe(true);
      expect(stats.overallProgress).toBe(75);

      // 5. Complete
      store.completeDownload(trackId, '/storage/music/rapid.mp3');
      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.isDownloading).toBe(false);
      expect(stats.completedCount).toBe(1);
      expect(stats.totalActiveCount).toBe(0);
      expect(stats.overallProgress).toBe(0);
    });

    it('survives high-volume queue pipeline with concurrent transitions and errors', () => {
      const store = useDownloadStore.getState();
      const itemCount = 50;

      // Enqueue 50 tracks
      for (let i = 1; i <= itemCount; i++) {
        store.queueDownload(`stress-q-${i}`, `Stress Song ${i}`, 'track');
      }

      let stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.queuedCount).toBe(50);
      expect(stats.totalActiveCount).toBe(50);
      expect(stats.activeDownloadsCount).toBe(0);

      // Transition first 10 to downloading with staggered progress
      for (let i = 1; i <= 10; i++) {
        store.resumeDownload(`stress-q-${i}`);
        store.updateProgress(`stress-q-${i}`, i * 10); // 10%, 20%, ..., 100%
      }

      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.isDownloading).toBe(true);
      expect(stats.activeDownloadsCount).toBe(10);
      expect(stats.queuedCount).toBe(40);
      expect(stats.totalActiveCount).toBe(50);
      // Average of 10, 20, ..., 100 is 55
      expect(stats.overallProgress).toBe(55);

      // Complete 4, Error 2, Cancel 2, Pause 2
      store.completeDownload('stress-q-1', '/p1');
      store.completeDownload('stress-q-2', '/p2');
      store.completeDownload('stress-q-3', '/p3');
      store.completeDownload('stress-q-4', '/p4');

      store.errorDownload('stress-q-5', 'Network timeout');
      store.errorDownload('stress-q-6', 'Disk full');

      store.cancelDownload('stress-q-7');
      store.cancelDownload('stress-q-8');

      store.pauseDownload('stress-q-9');
      store.pauseDownload('stress-q-10');

      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.activeDownloadsCount).toBe(0);
      expect(stats.queuedCount).toBe(40);
      expect(stats.completedCount).toBe(4);
      expect(stats.isDownloading).toBe(false);
      expect(stats.overallProgress).toBe(0);

      // Clear history should clean completed, error, cancelled without touching queued items
      store.clearHistory();
      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.completedCount).toBe(0);
      expect(stats.queuedCount).toBe(40);
      expect(stats.totalActiveCount).toBe(40);
    });

    it('handles rapid item removals while downloads are actively ticking', () => {
      const store = useDownloadStore.getState();
      store.startDownload('tick-1', 'Ticking 1', 'track');
      store.startDownload('tick-2', 'Ticking 2', 'track');
      store.updateProgress('tick-1', 40);
      store.updateProgress('tick-2', 60);

      let stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.overallProgress).toBe(50);

      // Remove tick-1 abruptly
      store.removeDownload('tick-1');
      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.activeDownloadsCount).toBe(1);
      expect(stats.overallProgress).toBe(60);

      // Remove tick-2 abruptly
      store.removeDownload('tick-2');
      stats = getDownloadQueueStats(useDownloadStore.getState().downloads);
      expect(stats.activeDownloadsCount).toBe(0);
      expect(stats.isDownloading).toBe(false);
      expect(stats.overallProgress).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 3: Dynamic Progress Ring SVG Math & Clamping
  // ==========================================================================
  describe('Suite 3: Circular SVG Progress Ring Math & Clamping', () => {
    it('renders exact SVG strokeDasharray and strokeDashoffset for progress = 0%', () => {
      useUIStore.setState({ leftSidebarWidth: 96 }); // Compact mode
      const store = useDownloadStore.getState();
      store.startDownload('svg-0', 'Song 0%', 'track');
      store.updateProgress('svg-0', 0);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const circles = container.querySelectorAll('svg.-rotate-90 circle');
      expect(circles.length).toBe(2); // Background track + Progress ring

      const progressCircle = circles[1];
      const radius = 12;
      const expectedCircumference = 2 * Math.PI * radius; // ~75.39822

      const dashArray = Number(progressCircle.getAttribute('stroke-dasharray'));
      const dashOffset = Number(progressCircle.getAttribute('stroke-dashoffset'));

      expect(dashArray).toBeCloseTo(expectedCircumference, 3);
      // At 0% progress: strokeDashoffset = circumference - 0 = circumference
      expect(dashOffset).toBeCloseTo(expectedCircumference, 3);
    });

    it('renders exact strokeDashoffset for progress = 50%', () => {
      useUIStore.setState({ leftSidebarWidth: 96 });
      const store = useDownloadStore.getState();
      store.startDownload('svg-50', 'Song 50%', 'track');
      store.updateProgress('svg-50', 50);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const circles = container.querySelectorAll('svg.-rotate-90 circle');
      const progressCircle = circles[1];
      const radius = 12;
      const expectedCircumference = 2 * Math.PI * radius;

      const dashOffset = Number(progressCircle.getAttribute('stroke-dashoffset'));
      // At 50% progress: strokeDashoffset = circumference * 0.5
      expect(dashOffset).toBeCloseTo(expectedCircumference * 0.5, 3);
    });

    it('renders strokeDashoffset = 0 for progress = 100%', () => {
      useUIStore.setState({ leftSidebarWidth: 96 });
      const store = useDownloadStore.getState();
      store.startDownload('svg-100', 'Song 100%', 'track');
      store.updateProgress('svg-100', 100);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const circles = container.querySelectorAll('svg.-rotate-90 circle');
      const progressCircle = circles[1];

      const dashOffset = Number(progressCircle.getAttribute('stroke-dashoffset'));
      // At 100% progress: strokeDashoffset = circumference - circumference = 0
      expect(dashOffset).toBeCloseTo(0, 3);
    });

    it('maintains finite, valid SVG stroke values even under extreme progress values', () => {
      useUIStore.setState({ leftSidebarWidth: 96 });
      const store = useDownloadStore.getState();
      store.startDownload('svg-extreme', 'Song Extreme', 'track');
      store.updateProgress('svg-extreme', 150); // >100%

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const circles = container.querySelectorAll('svg.-rotate-90 circle');
      expect(circles.length).toBe(2);
      const progressCircle = circles[1];

      const dashOffsetStr = progressCircle.getAttribute('stroke-dashoffset');
      expect(dashOffsetStr).not.toBeNull();
      expect(dashOffsetStr).not.toContain('NaN');
      expect(Number.isFinite(Number(dashOffsetStr))).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 4: Layout Breakpoints & Large Queue Badge Stress (99+ Clamping)
  // ==========================================================================
  describe('Suite 4: Layout Breakpoints, Badges & High-Volume Queues', () => {
    it('unmounts/hides sidebar completely when leftSidebarWidth is 0', () => {
      useUIStore.setState({ leftSidebarWidth: 0 });

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders Compact layout when leftSidebarWidth is 120 (boundary condition)', () => {
      useUIStore.setState({ leftSidebarWidth: 120 }); // <=120 -> Compact

      const store = useDownloadStore.getState();
      store.startDownload('comp-bound', 'Compact Bound', 'track');
      store.updateProgress('comp-bound', 64);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // In compact mode: SVG progress ring is rendered, mini horizontal bar is NOT rendered
      const svgRing = container.querySelector('svg.-rotate-90');
      expect(svgRing).not.toBeNull();
      expect(screen.getByText('64%')).toBeDefined();
    });

    it('renders Wide layout when leftSidebarWidth is 121 (boundary condition)', () => {
      useUIStore.setState({ leftSidebarWidth: 121 }); // >120 -> Wide

      const store = useDownloadStore.getState();
      store.startDownload('wide-bound', 'Wide Bound', 'track');
      store.updateProgress('wide-bound', 88);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // In wide mode: horizontal mini progress bar is rendered with exact width %
      const miniBar = container.querySelector('.bg-primary.h-full.rounded-full') as HTMLElement;
      expect(miniBar).not.toBeNull();
      expect(miniBar.style.width).toBe('88%');

      // Wide mode header label, percentage, and dynamic status text are rendered
      expect(screen.getByText('88%')).toBeDefined();
      expect(screen.getByText('Загрузка...')).toBeDefined();
      expect(screen.getByText('Загрузки')).toBeDefined();
    });

    it('clamps badge to "99+" in compact mode when total active count >= 100', () => {
      useUIStore.setState({ leftSidebarWidth: 96 }); // Compact mode
      const store = useDownloadStore.getState();

      // Add 150 items to queue
      for (let i = 1; i <= 150; i++) {
        store.queueDownload(`bulk-${i}`, `Bulk Song ${i}`, 'track');
      }

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('99+')).toBeDefined();
      expect(screen.queryByText('150')).toBeNull();
    });

    it('displays exact count badge in compact mode when total active count is 99 or less', () => {
      useUIStore.setState({ leftSidebarWidth: 96 });
      const store = useDownloadStore.getState();

      for (let i = 1; i <= 99; i++) {
        store.queueDownload(`bulk-${i}`, `Bulk Song ${i}`, 'track');
      }

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('99')).toBeDefined();
      expect(screen.queryByText('99+')).toBeNull();
    });

    it('renders exact pill count in wide mode when queued items exist and none are downloading', () => {
      useUIStore.setState({ leftSidebarWidth: 180 });
      const store = useDownloadStore.getState();

      for (let i = 1; i <= 120; i++) {
        store.queueDownload(`q-${i}`, `Song ${i}`, 'track');
      }

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // In wide mode with only queued items: pill displays total count (e.g. 120)
      expect(screen.getByText('120')).toBeDefined();
      // No downloading progress bar
      expect(screen.queryByText('Загрузка...')).toBeNull();
    });

    it('renders dynamic subtitle "X из Y" in wide mode with multiple concurrent downloads', () => {
      useUIStore.setState({ leftSidebarWidth: 200 });
      const store = useDownloadStore.getState();

      // 5 active, 45 queued -> total 50
      for (let i = 1; i <= 5; i++) {
        store.startDownload(`active-${i}`, `Active ${i}`, 'track');
        store.updateProgress(`active-${i}`, 40);
      }
      for (let i = 6; i <= 50; i++) {
        store.queueDownload(`q-${i}`, `Queued ${i}`, 'track');
      }

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('5 из 50')).toBeDefined();
      expect(screen.getByText('40%')).toBeDefined();
    });
  });

  // ==========================================================================
  // Suite 5: Dynamic Tooltip Generation, Navigation & Platform Gating
  // ==========================================================================
  describe('Suite 5: Tooltips, Route Activation & Platform Gating', () => {
    it('generates idle tooltip when download queue is empty', () => {
      useUIStore.setState({ leftSidebarWidth: 150 });

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const link = screen.getByTitle('Загрузки');
      expect(link).toBeDefined();
    });

    it('generates queued-only tooltip when items are waiting in queue', () => {
      useUIStore.setState({ leftSidebarWidth: 150 });
      const store = useDownloadStore.getState();
      store.queueDownload('q-1', 'Queued 1', 'track');
      store.queueDownload('q-2', 'Queued 2', 'track');
      store.queueDownload('q-3', 'Queued 3', 'track');

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const link = screen.getByTitle('Загрузки: 3 в очереди');
      expect(link).toBeDefined();
    });

    it('generates active downloading tooltip with percentage and active/total ratio', () => {
      useUIStore.setState({ leftSidebarWidth: 150 });
      const store = useDownloadStore.getState();
      store.startDownload('act-1', 'Active 1', 'track');
      store.startDownload('act-2', 'Active 2', 'track');
      store.queueDownload('q-1', 'Queued 1', 'track');
      store.updateProgress('act-1', 40);
      store.updateProgress('act-2', 60);

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // avgProgress = 50%, activeDownloads = 2, totalActive = 3
      const link = screen.getByTitle('Загрузки: 50% (2/3)');
      expect(link).toBeDefined();
    });

    it('navigates seamlessly from Compact sidebar to /Holad/downloads route', () => {
      useUIStore.setState({ leftSidebarWidth: 96 }); // Compact mode

      render(
        <MemoryRouter initialEntries={['/Holad/favorites']}>
          <Routes>
            <Route path="*" element={<Sidebar />} />
            <Route path="/Holad/downloads" element={<div data-testid="compact-downloads-view">Downloads Destination</div>} />
          </Routes>
        </MemoryRouter>
      );

      const downloadLink = screen.getByTitle('Загрузки');
      fireEvent.click(downloadLink);

      expect(screen.getByTestId('compact-downloads-view')).toBeDefined();
    });

    it('renders left vertical active indicator in Compact mode when on /Holad/downloads', () => {
      useUIStore.setState({ leftSidebarWidth: 96 }); // Compact mode

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad/downloads']}>
          <Sidebar />
        </MemoryRouter>
      );

      // Active compact item renders left-0 top-1/2 rounded indicator bar
      const activeIndicator = container.querySelector('.bg-primary.rounded-r-md');
      expect(activeIndicator).not.toBeNull();
    });

    it('renders highlighted background styling in Wide mode when on /Holad/downloads', () => {
      useUIStore.setState({ leftSidebarWidth: 180 }); // Wide mode

      render(
        <MemoryRouter initialEntries={['/Holad/downloads']}>
          <Sidebar />
        </MemoryRouter>
      );

      const downloadLink = screen.getByTitle('Загрузки');
      expect(downloadLink.className).toContain('bg-white/10');
      expect(downloadLink.className).toContain('text-primary');
    });

    it('omits SidebarDownloadsItem entirely when platform is Web (non-native)', () => {
      setPlatform('web'); // Web browser mode without native filesystem
      useUIStore.setState({ leftSidebarWidth: 180 });

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // Downloads item should not be rendered on web platform
      expect(screen.queryByTitle(/Загрузки/)).toBeNull();
      expect(screen.queryByText('Загрузки')).toBeNull();
    });

    it('renders SidebarDownloadsItem when platform is Capacitor (mobile)', () => {
      setPlatform('capacitor');
      useUIStore.setState({ leftSidebarWidth: 180 });

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByTitle('Загрузки')).toBeDefined();
      expect(screen.getByText('Загрузки')).toBeDefined();
    });
  });
});
