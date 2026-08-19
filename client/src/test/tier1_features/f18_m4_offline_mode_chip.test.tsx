import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import TopBar from '../../components/layout/TopBar';
import MobileMainContent from '../../components/layout/MobileMainContent';
import LibraryView from '../../components/layout/LibraryView';
import OfflineModeModal from '../../components/modals/OfflineModeModal';
import { useUIStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import { 
  isOnline, 
  isOffline, 
  isForcedOffline, 
  setForcedOffline, 
  toggleOfflineMode, 
  setNetworkStatusForTesting, 
  resetNetworkStatusForTesting,
  addNetworkListener
} from '../../utils/networkStatus';

describe('Milestone 4: Offline Mode Indicator Chip & Explanatory Modal', () => {
  beforeEach(() => {
    act(() => {
      resetNetworkStatusForTesting();
      useUIStore.setState({
        activeFilter: null,
        isOfflineModalOpen: false,
        searchQuery: '',
        isSearchOpen: false,
        leftSidebarWidth: 96,
        rightSidebarWidth: 320,
      });
      useSettingsStore.setState({
        hideOfflineExplanationModal: false,
      });
    });
  });

  afterEach(() => {
    act(() => {
      resetNetworkStatusForTesting();
    });
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Reactive Network Manager & Force Offline Support
  // ==========================================================================
  describe('NetworkStatusManager & Reactive Offline State', () => {
    it('initializes in online state and reports correctly', () => {
      act(() => {
        setNetworkStatusForTesting(true);
      });
      expect(isOnline()).toBe(true);
      expect(isOffline()).toBe(false);
      expect(isForcedOffline()).toBe(false);
    });

    it('toggles forced offline state and notifies listeners', () => {
      act(() => {
        setNetworkStatusForTesting(true);
      });
      const listener = vi.fn();
      const unsubscribe = addNetworkListener(listener);

      act(() => {
        toggleOfflineMode();
      });
      expect(isForcedOffline()).toBe(true);
      expect(isOffline()).toBe(true);
      expect(isOnline()).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);

      act(() => {
        toggleOfflineMode();
      });
      expect(isForcedOffline()).toBe(false);
      expect(isOnline()).toBe(true);
      expect(isOffline()).toBe(false);
      expect(listener).toHaveBeenCalledWith(true);

      unsubscribe();
    });

    it('setForcedOffline explicitly sets forced offline state', () => {
      act(() => {
        setNetworkStatusForTesting(true);
        setForcedOffline(true);
      });
      expect(isOffline()).toBe(true);
      expect(isForcedOffline()).toBe(true);

      act(() => {
        setForcedOffline(false);
      });
      expect(isOffline()).toBe(false);
      expect(isForcedOffline()).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Settings Store Preference: hideOfflineExplanationModal
  // ==========================================================================
  describe('SettingsStore hideOfflineExplanationModal', () => {
    it('defaults hideOfflineExplanationModal to false', () => {
      expect(useSettingsStore.getState().hideOfflineExplanationModal).toBe(false);
    });

    it('updates hideOfflineExplanationModal state correctly', () => {
      act(() => {
        useSettingsStore.getState().setHideOfflineExplanationModal(true);
      });
      expect(useSettingsStore.getState().hideOfflineExplanationModal).toBe(true);

      act(() => {
        useSettingsStore.getState().setHideOfflineExplanationModal(false);
      });
      expect(useSettingsStore.getState().hideOfflineExplanationModal).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Desktop TopBar Offline Indicator Chip
  // ==========================================================================
  describe('Desktop TopBar Offline Indicator Chip', () => {
    it('does NOT render offline chip when app is online', () => {
      act(() => {
        setNetworkStatusForTesting(true);
      });

      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      const chip = screen.queryByTestId('desktop-offline-chip');
      expect(chip).toBeNull();
    });

    it('renders offline chip with CloudOff icon and text when offline', () => {
      act(() => {
        setNetworkStatusForTesting(false);
      });

      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      const chip = screen.getByTestId('desktop-offline-chip');
      expect(chip).toBeDefined();
      expect(chip.className).toContain('bg-primary/10');
      expect(chip.className).toContain('text-primary');
      expect(chip.className).toContain('border-primary/30');
      expect(chip.className).toContain('rounded-full');
      expect(screen.getByText('Офлайн')).toBeDefined();
    });

    it('clicking offline chip opens explanatory modal when hideOfflineExplanationModal is false', () => {
      act(() => {
        setNetworkStatusForTesting(false);
        useSettingsStore.setState({ hideOfflineExplanationModal: false });
      });

      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      const chip = screen.getByTestId('desktop-offline-chip');
      act(() => {
        fireEvent.click(chip);
      });

      expect(useUIStore.getState().isOfflineModalOpen).toBe(true);
      expect(screen.getByTestId('offline-mode-modal')).toBeDefined();
      expect(screen.getByText('Офлайн-режим')).toBeDefined();
    });

    it('clicking offline chip directly toggles offline mode when hideOfflineExplanationModal is true', () => {
      act(() => {
        setNetworkStatusForTesting(false);
        setForcedOffline(true);
        useSettingsStore.setState({ hideOfflineExplanationModal: true });
      });

      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      const chip = screen.getByTestId('desktop-offline-chip');
      act(() => {
        fireEvent.click(chip);
      });

      // Modal is NOT opened
      expect(useUIStore.getState().isOfflineModalOpen).toBe(false);
      expect(screen.queryByTestId('offline-mode-modal')).toBeNull();
      // Forced offline toggled off
      expect(isForcedOffline()).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Explanatory Modal (OfflineModeModal)
  // ==========================================================================
  describe('OfflineModeModal Component', () => {
    it('renders modal details, features, and buttons correctly', () => {
      const onClose = vi.fn();
      render(<OfflineModeModal isOpen={true} onClose={onClose} />);

      expect(screen.getByTestId('offline-mode-modal')).toBeDefined();
      expect(screen.getByText('Офлайн-режим')).toBeDefined();
      expect(screen.getByTestId('offline-modal-dont-show-checkbox')).toBeDefined();
      expect(screen.getByTestId('offline-modal-confirm-btn')).toBeDefined();
      expect(screen.getByTestId('offline-modal-toggle-btn')).toBeDefined();
      expect(screen.getByTestId('offline-modal-close-btn')).toBeDefined();
    });

    it('checking "Don\'t show this again" persists to settingsStore', () => {
      const onClose = vi.fn();
      render(<OfflineModeModal isOpen={true} onClose={onClose} />);

      const checkbox = screen.getByTestId('offline-modal-dont-show-checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      act(() => {
        fireEvent.click(checkbox);
      });
      expect(checkbox.checked).toBe(true);
      expect(useSettingsStore.getState().hideOfflineExplanationModal).toBe(true);
    });

    it('confirm button closes the modal', () => {
      const onClose = vi.fn();
      render(<OfflineModeModal isOpen={true} onClose={onClose} />);

      const confirmBtn = screen.getByTestId('offline-modal-confirm-btn');
      act(() => {
        fireEvent.click(confirmBtn);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('close (X) button closes the modal', () => {
      const onClose = vi.fn();
      render(<OfflineModeModal isOpen={true} onClose={onClose} />);

      const closeBtn = screen.getByTestId('offline-modal-close-btn');
      act(() => {
        fireEvent.click(closeBtn);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('toggle offline button triggers toggle handler and closes modal', () => {
      const onClose = vi.fn();
      const onToggle = vi.fn();
      render(<OfflineModeModal isOpen={true} onClose={onClose} onToggleOffline={onToggle} />);

      const toggleBtn = screen.getByTestId('offline-modal-toggle-btn');
      act(() => {
        fireEvent.click(toggleBtn);
      });

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 5. Mobile Filter Chips Highlighting & Toggle
  // ==========================================================================
  describe('Mobile Filter Chips (MobileMainContent & LibraryView)', () => {
    it('highlights mobile offline filter chip when offline in MobileMainContent', () => {
      act(() => {
        setNetworkStatusForTesting(false);
      });

      render(
        <MemoryRouter>
          <MobileMainContent albums={[]} recentTracks={[]} frequentAlbums={[]} genres={[]} />
        </MemoryRouter>
      );

      const mobileChip = screen.getByTestId('mobile-offline-chip');
      expect(mobileChip).toBeDefined();
      expect(mobileChip.className).toContain('bg-primary');
      expect(mobileChip.className).toContain('text-black');
    });

    it('mobile offline chip click opens modal when not suppressed', () => {
      act(() => {
        setNetworkStatusForTesting(false);
        useSettingsStore.setState({ hideOfflineExplanationModal: false });
      });

      render(
        <MemoryRouter>
          <MobileMainContent albums={[]} recentTracks={[]} frequentAlbums={[]} genres={[]} />
        </MemoryRouter>
      );

      const mobileChip = screen.getByTestId('mobile-offline-chip');
      act(() => {
        fireEvent.click(mobileChip);
      });

      expect(useUIStore.getState().isOfflineModalOpen).toBe(true);
      expect(screen.getByTestId('offline-mode-modal')).toBeDefined();
    });

    it('mobile offline chip click toggles mode directly when suppressed in MobileMainContent', () => {
      act(() => {
        setNetworkStatusForTesting(false);
        setForcedOffline(true);
        useSettingsStore.setState({ hideOfflineExplanationModal: true });
      });

      render(
        <MemoryRouter>
          <MobileMainContent albums={[]} recentTracks={[]} frequentAlbums={[]} genres={[]} />
        </MemoryRouter>
      );

      const mobileChip = screen.getByTestId('mobile-offline-chip');
      act(() => {
        fireEvent.click(mobileChip);
      });

      expect(useUIStore.getState().isOfflineModalOpen).toBe(false);
      expect(screen.queryByTestId('offline-mode-modal')).toBeNull();
      expect(isForcedOffline()).toBe(false);
    });

    it('highlights and handles offline chip in LibraryView', () => {
      act(() => {
        setNetworkStatusForTesting(false);
      });

      render(
        <MemoryRouter initialEntries={['/Holad/library/albums']}>
          <LibraryView />
        </MemoryRouter>
      );

      const libChip = screen.getByTestId('library-mobile-offline-chip');
      expect(libChip).toBeDefined();
      expect(libChip.className).toContain('bg-primary');
      expect(libChip.className).toContain('text-black');
    });
  });
});
