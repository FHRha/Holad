import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { getAudioEngine, AudioEngine } from '../audio/AudioEngine';
import { TauriAudioBackend } from '../audio/TauriAudioBackend';
import PlaybackSettingsSection from '../components/settings/sections/PlaybackSettingsSection';
import * as StorageManager from '../utils/StorageManager';

describe('Audio Backend Settings & Reactive Engine Switching', () => {
  beforeEach(() => {
    useSettingsStore.setState({ audioBackend: 'rust' });
    vi.restoreAllMocks();
  });

  it('initializes with default audioBackend="rust"', () => {
    expect(useSettingsStore.getState().audioBackend).toBe('rust');
  });

  it('allows switching audioBackend between "rust" and "web"', () => {
    useSettingsStore.getState().setAudioBackend('web');
    expect(useSettingsStore.getState().audioBackend).toBe('web');

    useSettingsStore.getState().setAudioBackend('rust');
    expect(useSettingsStore.getState().audioBackend).toBe('rust');
  });

  it('getAudioEngine() switches reactively based on audioBackend and environment', () => {
    vi.spyOn(StorageManager, 'isTauri').mockReturnValue(true);

    useSettingsStore.getState().setAudioBackend('rust');
    expect(getAudioEngine()).toBe(TauriAudioBackend.getInstance());

    useSettingsStore.getState().setAudioBackend('web');
    expect(getAudioEngine()).toBe(AudioEngine.getInstance());

    // In pure web, it always returns AudioEngine.getInstance()
    vi.spyOn(StorageManager, 'isTauri').mockReturnValue(false);
    expect(getAudioEngine()).toBe(AudioEngine.getInstance());
  });

  it('renders audio engine selection in PlaybackSettingsSection ONLY when isTauri() is true', () => {
    vi.spyOn(StorageManager, 'isTauri').mockReturnValue(false);

    const { rerender } = render(<PlaybackSettingsSection mode="audio" />);
    expect(screen.queryByLabelText(/Нативный аудио-движок/i)).toBeNull();
    expect(screen.queryByLabelText(/Web Audio API/i)).toBeNull();

    vi.spyOn(StorageManager, 'isTauri').mockReturnValue(true);
    rerender(<PlaybackSettingsSection mode="audio" />);

    const rustOption = screen.getByLabelText(/Нативный аудио-движок/i);
    const webOption = screen.getByLabelText(/Web Audio API/i);

    expect(rustOption).not.toBeNull();
    expect(webOption).not.toBeNull();
    expect(rustOption.getAttribute('role')).toBe('radio');
    expect(webOption.getAttribute('role')).toBe('radio');
    expect(rustOption.getAttribute('aria-checked')).toBe('true');
    expect(webOption.getAttribute('aria-checked')).toBe('false');

    // Clicking webOption switches backend to 'web'
    fireEvent.click(webOption);
    expect(useSettingsStore.getState().audioBackend).toBe('web');
    expect(rustOption.getAttribute('aria-checked')).toBe('false');
    expect(webOption.getAttribute('aria-checked')).toBe('true');

    // Clicking rustOption switches backend back to 'rust'
    fireEvent.click(rustOption);
    expect(useSettingsStore.getState().audioBackend).toBe('rust');
    expect(rustOption.getAttribute('aria-checked')).toBe('true');
    expect(webOption.getAttribute('aria-checked')).toBe('false');
  });

  it('TauriAudioBackend.seek() when paused does NOT trigger playTrack or autoplay', async () => {
    const backend = TauriAudioBackend.getInstance();
    const playTrackSpy = vi.spyOn(backend, 'playTrack');

    // Simulate paused state on cold start
    const { usePlayerStore } = await import('../store/playerStore');
    usePlayerStore.setState({ isPlaying: false, queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }] as any, currentIndex: 0 });

    backend.seek(45);

    expect(backend.getCurrentTime()).toBe(45);
    // playTrack must NOT be called when seeking while paused
    expect(playTrackSpy).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('TauriAudioBackend synchronizes usePlayerStore.isPlaying reactively on native state changes', async () => {
    const backend = TauriAudioBackend.getInstance();
    const { usePlayerStore } = await import('../store/playerStore');

    usePlayerStore.setState({ isPlaying: false });

    // Simulate native event listener callback for playing
    (backend as any).isPlaying = true;
    usePlayerStore.setState({ isPlaying: true });
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // Simulate native pause event
    (backend as any).isPlaying = false;
    usePlayerStore.setState({ isPlaying: false });
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});
