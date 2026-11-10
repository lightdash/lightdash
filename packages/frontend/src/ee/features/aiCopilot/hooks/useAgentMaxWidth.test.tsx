import { renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AgentContainerWidthContext,
    useAgentMaxWidth,
} from './useAgentMaxWidth';

const mockViewport = (matches: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
            ({
                matches,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }) as MediaQueryList,
    );

const withContainerWidth =
    (width: number | null): FC<PropsWithChildren> =>
    ({ children }) => (
        <AgentContainerWidthContext.Provider value={width}>
            {children}
        </AgentContainerWidthContext.Provider>
    );

describe('useAgentMaxWidth', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('follows the viewport when the container width is unknown', () => {
        mockViewport(true);
        const { result } = renderHook(
            () => useAgentMaxWidth(768, { getInitialValueInEffect: false }),
            { wrapper: withContainerWidth(null) },
        );
        expect(result.current).toBe(true);
    });

    it('follows a narrow container inside a wide viewport', () => {
        mockViewport(false);
        const { result } = renderHook(
            () => useAgentMaxWidth(768, { getInitialValueInEffect: false }),
            { wrapper: withContainerWidth(500) },
        );
        expect(result.current).toBe(true);
    });

    it('follows a wide container inside a narrow viewport', () => {
        mockViewport(true);
        const { result } = renderHook(
            () => useAgentMaxWidth(768, { getInitialValueInEffect: false }),
            { wrapper: withContainerWidth(1200) },
        );
        expect(result.current).toBe(false);
    });
});
