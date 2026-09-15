import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    CONTENT_HEADER_COMPACT_MEDIA_QUERY,
    useCompactContentHeader,
} from './useCompactContentHeader';

describe('useCompactContentHeader', () => {
    it('keeps the regular header at 640px and collapses below it', () => {
        let width = 640;
        const listeners = new Set<(event: MediaQueryListEvent) => void>();
        const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
            (query) =>
                ({
                    matches:
                        query === CONTENT_HEADER_COMPACT_MEDIA_QUERY &&
                        width < 40 * 16,
                    media: query,
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: (
                        _name: string,
                        callback: (event: MediaQueryListEvent) => void,
                    ) => listeners.add(callback),
                    removeEventListener: (
                        _name: string,
                        callback: (event: MediaQueryListEvent) => void,
                    ) => listeners.delete(callback),
                    dispatchEvent: vi.fn(),
                }) as MediaQueryList,
        );

        try {
            const { result } = renderHook(() => useCompactContentHeader());
            expect(result.current).toBe(false);

            act(() => {
                width = 639;
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
