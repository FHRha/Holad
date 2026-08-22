import { beforeEach, vi } from 'vitest';
import { MockAudioContext, createMockAudioElement } from './mocks/mockAudio';
import i18n from 'i18next';
import React from 'react';

vi.mock('react-virtuoso', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Virtuoso: (props: any) => React.createElement(actual.Virtuoso, { initialItemCount: props.data ? props.data.length : 50, ...props }),
    VirtuosoGrid: (props: any) => React.createElement(actual.VirtuosoGrid, { initialItemCount: props.data ? props.data.length : 50, ...props }),
  };
});

// Initialize i18n mock for testing
if (!i18n.isInitialized) {
  i18n.init({
    lng: 'ru',
    fallbackLng: 'ru',
    resources: {
      en: { translation: {} },
      ru: { translation: {} },
    },
    interpolation: { escapeValue: false },
  });
}

// Setup global Audio and AudioContext
(global as any).AudioContext = MockAudioContext;
(global as any).webkitAudioContext = MockAudioContext;
if (typeof window !== 'undefined') {
  (window as any).AudioContext = MockAudioContext;
  (window as any).webkitAudioContext = MockAudioContext;
  
  (global as any).Audio = function() {
    return createMockAudioElement();
  };
  (window as any).Audio = function() {
    return createMockAudioElement();
  } as any;
}

// Mock window.matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock localStorage
  const localStorageMock = (function() {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value.toString(); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    };
  })();
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });

  // Mock IntersectionObserver
  class IntersectionObserverMock {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }
    observe(element: Element) {
      this.callback([{ isIntersecting: true, target: element } as any], this as any);
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'IntersectionObserver', { value: IntersectionObserverMock });
}

// Reset stores and mock global context before each test
beforeEach(() => {
  if (typeof window !== 'undefined') {
    (window as any)._globalAudioContext = new MockAudioContext();
    window.localStorage.clear();
  }
});
