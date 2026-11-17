import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompactNavigation } from './useCompactNavigation';

const mockViewportWidth = (width: number) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
            ({
                matches: (() => {
                    const maxWidth = /\(width < ([\d.]+)em\)/.exec(query);
                    return maxWidth ? width < Number(maxWidth[1]) * 16 : false;
                })(),
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }) as MediaQueryList,
    );

describe('useCompactNavigation', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([
        [512, false],
        [511, true],
    ])('at %ipx wide, compact navigation is %s', (width, compact) => {
        mockViewportWidth(width);
        const { result } = renderHook(() => useCompactNavigation());
        expect(result.current).toBe(compact);
    });
});
