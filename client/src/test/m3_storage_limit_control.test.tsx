import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StorageLimitControl from '../components/settings/StorageLimitControl';
import { useSettingsStore } from '../store/settingsStore';
import { useStorageStats } from '../utils/storageStatsHelper';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => options?.defaultValue || key,
  }),
}));

vi.mock('../store/settingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

vi.mock('../utils/storageStatsHelper', () => ({
  useStorageStats: vi.fn(),
}));

describe('StorageLimitControl', () => {
  const setTotalStorageLimitGbMock = vi.fn();
  const refreshMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useSettingsStore as any).mockReturnValue({
      totalStorageLimitGb: 10,
      setTotalStorageLimitGb: setTotalStorageLimitGbMock,
    });

    (useStorageStats as any).mockReturnValue({
      stats: {
        audioBytes: 0,
        imageBytes: 0,
        metadataBytes: 0,
        totalBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      },
      refresh: refreshMock,
    });
  });

  it('renders correctly with default props', () => {
    render(<StorageLimitControl />);
    expect(screen.getByTestId('storage-limit-control')).toBeDefined();
    expect(screen.getByTestId('storage-limit-badge').textContent).toContain('10 GB');
  });

  it('renders all preset buttons', () => {
    render(<StorageLimitControl />);
    expect(screen.getByTestId('storage-limit-preset-5')).toBeDefined();
    expect(screen.getByTestId('storage-limit-preset-10')).toBeDefined();
    expect(screen.getByTestId('storage-limit-preset-50')).toBeDefined();
    expect(screen.getByTestId('storage-limit-preset-0')).toBeDefined();
  });

  it('calls setTotalStorageLimitGb and refresh when a preset is clicked', () => {
    render(<StorageLimitControl />);
    
    fireEvent.click(screen.getByTestId('storage-limit-preset-50'));
    
    expect(setTotalStorageLimitGbMock).toHaveBeenCalledWith(50);
    expect(refreshMock).toHaveBeenCalled();
  });

  it('handles 0/Unlimited correctly', () => {
    (useSettingsStore as any).mockReturnValue({
      totalStorageLimitGb: 0,
      setTotalStorageLimitGb: setTotalStorageLimitGbMock,
    });

    render(<StorageLimitControl />);
    
    expect(screen.getByTestId('storage-limit-badge').textContent).toContain('Безлимитно');
    
    fireEvent.click(screen.getByTestId('storage-limit-preset-0'));
    expect(setTotalStorageLimitGbMock).toHaveBeenCalledWith(0);
  });

  it('shows over limit warning when used space is >= total space', () => {
    (useStorageStats as any).mockReturnValue({
      stats: {
        audioBytes: 8 * 1024 * 1024 * 1024,
        imageBytes: 2 * 1024 * 1024 * 1024,
        metadataBytes: 0,
        totalBytes: 10 * 1024 * 1024 * 1024, // 10 GB total, 10 GB used
      },
      refresh: refreshMock,
    });

    render(<StorageLimitControl />);
    expect(screen.getByTestId('storage-limit-warning-over')).toBeDefined();
    expect(screen.queryByTestId('storage-limit-warning-near')).toBeNull();
  });

  it('shows near limit warning when used space is >= 90% of total space but < 100%', () => {
    (useStorageStats as any).mockReturnValue({
      stats: {
        audioBytes: 9 * 1024 * 1024 * 1024,
        imageBytes: 0,
        metadataBytes: 0,
        totalBytes: 10 * 1024 * 1024 * 1024, // 10 GB total, 9 GB used (90%)
      },
      refresh: refreshMock,
    });

    render(<StorageLimitControl />);
    expect(screen.getByTestId('storage-limit-warning-near')).toBeDefined();
    expect(screen.queryByTestId('storage-limit-warning-over')).toBeNull();
  });

  it('does not show warnings when limit is unlimited (0)', () => {
    (useSettingsStore as any).mockReturnValue({
      totalStorageLimitGb: 0,
      setTotalStorageLimitGb: setTotalStorageLimitGbMock,
    });

    (useStorageStats as any).mockReturnValue({
      stats: {
        audioBytes: 100 * 1024 * 1024 * 1024,
        imageBytes: 0,
        metadataBytes: 0,
        totalBytes: 10 * 1024 * 1024 * 1024,
      },
      refresh: refreshMock,
    });

    render(<StorageLimitControl />);
    expect(screen.queryByTestId('storage-limit-warning-over')).toBeNull();
    expect(screen.queryByTestId('storage-limit-warning-near')).toBeNull();
  });
});
