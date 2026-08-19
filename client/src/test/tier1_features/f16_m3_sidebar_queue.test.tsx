import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  resetE2EHarness,
  setPlatform,
} from '../e2e/harness';
import { useDownloadStore, getDownloadQueueStats } from '../../store/downloadStore';
import { useUIStore } from '../../store/uiStore';
import Sidebar from '../../components/layout/Sidebar';

describe('Milestone 3 (Feature 12): Left Sidebar Download Queue UI & Store Stats', () => {
  beforeEach(() => {
    resetE2EHarness();
    setPlatform('tauri');
    useUIStore.setState({ leftSidebarWidth: 150 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Download Queue Store Metrics & Calculation Helpers
  // ==========================================================================
  describe('getDownloadQueueStats Helper', () => {
    it('returns empty stats when no downloads exist', () => {
      const stats = getDownloadQueueStats({});
      expect(stats.isDownloading).toBe(false);
      expect(stats.activeDownloadsCount).toBe(0);
      expect(stats.queuedCount).toBe(0);
      expect(stats.totalActiveCount).toBe(0);
      expect(stats.completedCount).toBe(0);
      expect(stats.overallProgress).toBe(0);
    });

    it('calculates average progress across multiple active downloads', () => {
      const downloads = {
        d1: { id: 'd1', name: 'Song 1', type: 'track' as const, status: 'downloading' as const, progress: 30, path: '', timestamp: 1 },
        d2: { id: 'd2', name: 'Song 2', type: 'track' as const, status: 'downloading' as const, progress: 90, path: '', timestamp: 2 },
        d3: { id: 'd3', name: 'Song 3', type: 'track' as const, status: 'queued' as const, progress: 0, path: '', timestamp: 3 },
      };

      const stats = getDownloadQueueStats(downloads);
      expect(stats.isDownloading).toBe(true);
      expect(stats.activeDownloadsCount).toBe(2);
      expect(stats.queuedCount).toBe(1);
      expect(stats.totalActiveCount).toBe(3);
      expect(stats.overallProgress).toBe(60); // (30 + 90) / 2 = 60
    });

    it('excludes completed, error, and cancelled downloads from active calculations', () => {
      const downloads = {
        d1: { id: 'd1', name: 'Song 1', type: 'track' as const, status: 'downloading' as const, progress: 75, path: '', timestamp: 1 },
        d2: { id: 'd2', name: 'Song 2', type: 'track' as const, status: 'completed' as const, progress: 100, path: '/p', timestamp: 2 },
        d3: { id: 'd3', name: 'Song 3', type: 'track' as const, status: 'error' as const, progress: 0, path: '', timestamp: 3 },
        d4: { id: 'd4', name: 'Song 4', type: 'track' as const, status: 'cancelled' as const, progress: 20, path: '', timestamp: 4 },
      };

      const stats = getDownloadQueueStats(downloads);
      expect(stats.isDownloading).toBe(true);
      expect(stats.activeDownloadsCount).toBe(1);
      expect(stats.completedCount).toBe(1);
      expect(stats.overallProgress).toBe(75);
    });
  });

  // ==========================================================================
  // 2. Sidebar UI in Expanded / Wide Mode
  // ==========================================================================
  describe('Sidebar Wide / Expanded Mode (leftSidebarWidth > 120)', () => {
    it('renders standard downloads button when idle in wide mode', () => {
      useUIStore.setState({ leftSidebarWidth: 160 });

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const downloadLink = screen.getByTitle('Загрузки');
      expect(downloadLink).toBeDefined();
      expect(screen.getByText('Загрузки')).toBeDefined();
    });

    it('renders mini progress bar and percentage when active downloads exist in wide mode', () => {
      useUIStore.setState({ leftSidebarWidth: 160 });

      const store = useDownloadStore.getState();
      store.startDownload('active-1', 'Active Song', 'track');
      store.updateProgress('active-1', 45);

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('45%')).toBeDefined();
      expect(screen.getByText('Загрузка...')).toBeDefined();
    });

    it('renders dynamic queue status and badge when multiple items are queued in wide mode', () => {
      useUIStore.setState({ leftSidebarWidth: 180 });

      const store = useDownloadStore.getState();
      store.startDownload('active-1', 'Active Song 1', 'track');
      store.startDownload('active-2', 'Active Song 2', 'track');
      store.queueDownload('queued-1', 'Queued Song 3', 'track');
      store.updateProgress('active-1', 50);
      store.updateProgress('active-2', 70);

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('60%')).toBeDefined();
      expect(screen.getByText('2 из 3')).toBeDefined();
    });
  });

  // ==========================================================================
  // 3. Sidebar UI in Compact Mode
  // ==========================================================================
  describe('Sidebar Compact Mode (leftSidebarWidth <= 120)', () => {
    it('renders circular SVG progress ring and percentage in compact mode when downloading', () => {
      useUIStore.setState({ leftSidebarWidth: 96 });

      const store = useDownloadStore.getState();
      store.startDownload('comp-1', 'Compact Downloading', 'track');
      store.updateProgress('comp-1', 80);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // SVG circle for progress ring should be present
      const svgRing = container.querySelector('svg.-rotate-90');
      expect(svgRing).not.toBeNull();
      expect(screen.getByText('80%')).toBeDefined();
    });

    it('renders count badge in compact mode when items are active or queued', () => {
      useUIStore.setState({ leftSidebarWidth: 96 });

      const store = useDownloadStore.getState();
      store.startDownload('comp-1', 'Song 1', 'track');
      store.queueDownload('comp-2', 'Song 2', 'track');
      store.queueDownload('comp-3', 'Song 3', 'track');

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('3')).toBeDefined();
    });
  });

  // ==========================================================================
  // 4. Navigation & Route Activation
  // ==========================================================================
  describe('Navigation & Route Highlighting', () => {
    it('clicking Downloads item navigates to /Holad/downloads', () => {
      useUIStore.setState({ leftSidebarWidth: 160 });

      render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Routes>
            <Route path="*" element={<Sidebar />} />
            <Route path="/Holad/downloads" element={<div data-testid="downloads-page">Downloads Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      const downloadLink = screen.getByTitle('Загрузки');
      fireEvent.click(downloadLink);

      expect(screen.getByTestId('downloads-page')).toBeDefined();
    });

    it('highlights Downloads navigation item when on /Holad/downloads route', () => {
      useUIStore.setState({ leftSidebarWidth: 160 });

      render(
        <MemoryRouter initialEntries={['/Holad/downloads']}>
          <Sidebar />
        </MemoryRouter>
      );

      const downloadLink = screen.getByTitle('Загрузки');
      expect(downloadLink.className).toContain('text-primary');
    });
  });
});
