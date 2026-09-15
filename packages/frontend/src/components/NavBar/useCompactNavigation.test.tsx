import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    NAVBAR_COMPACT_MEDIA_QUERY,
    useCompactNavigation,
} from './useCompactNavigation';

describe('useCompactNavigation', () => {
    it('keeps desktop navigation at 768px and collapses below it', () => {
        let width = 768;
        const listeners = new Set<(event: MediaQueryListEvent) => void>();
        const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
            (query) =>
                ({
                    matches:
                        query === NAVBAR_COMPACT_MEDIA_QUERY && width < 48 * 16,
                    media: query,
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: (
                        _name: string,
                        callback: (event: MediaQueryListEvent) => void,
                    ) => {
                        listeners.add(callback);
                    },
                    removeEventListener: (
                        _name: string,
                        callback: (event: MediaQueryListEvent) => void,
                    ) => {
                        listeners.delete(callback);
                    },
                    dispatchEvent: vi.fn(),
                }) as MediaQueryList,
        );

        try {
            const { result } = renderHook(() => useCompactNavigation());
            expect(result.current).toBe(false);

            act(() => {
                width = 767;
                listeners.forEach((listener) =>
                    listener({ matches: true } as MediaQueryListEvent),
                );
            });

            expect(result.current).toBe(true);
        } finally {
            matchMedia.mockRestore();
        }
    });
});
