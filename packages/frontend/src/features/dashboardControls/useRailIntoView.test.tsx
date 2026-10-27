import { MantineProvider } from '@mantine/core';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRailIntoView } from './useRailIntoView';

const rect = (top: number, height: number) =>
    ({
        top,
        bottom: top + height,
        height,
        left: 0,
        right: 0,
        width: 0,
    }) as DOMRect;

// The tabs and filter bar: stuck 60px from the top, 235px tall
const addStickyBar = (top: number) => {
    const bar = document.createElement('div');
    bar.setAttribute('data-has-header-above', 'true');
    bar.style.top = '60px';
    Object.defineProperty(bar, 'offsetHeight', { value: 235 });
    bar.getBoundingClientRect = () => rect(top, 235);
    document.body.appendChild(bar);
};

const railAt = (top: number) => {
    const rail = document.createElement('div');
    rail.getBoundingClientRect = () => rect(top, 400);
    document.body.appendChild(rail);
    return rail;
};

const wrapper = MantineProvider;

const setNarrow = (matches: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }) as never;
};

describe('useRailIntoView', () => {
    const scrollTo = vi.fn();
    beforeEach(() => {
        document.body.innerHTML = '';
        window.scrollY = 600;
        window.scrollTo = scrollTo as never;
        scrollTo.mockClear();
        setNarrow(true);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('scrolls a rail hidden under the stuck bar to just below it', () => {
        addStickyBar(60);
        // The rail went in above the viewport, behind the bar
        const rail = railAt(-200);
        renderHook(() => useRailIntoView({ current: rail }), { wrapper });

        // Page top of the rail (400), less the stuck bar's bottom (295) and a gap
        expect(scrollTo).toHaveBeenCalledWith({ top: 400 - 295 - 8 });
    });

    it('leaves a rail that is already in view where it is', () => {
        window.scrollY = 0;
        addStickyBar(119);
        const rail = railAt(354);
        renderHook(() => useRailIntoView({ current: rail }), { wrapper });
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('does nothing beside the grid, at the sm breakpoint and up', () => {
        setNarrow(false);
        addStickyBar(60);
        renderHook(() => useRailIntoView({ current: railAt(-200) }), {
            wrapper,
        });
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('puts the page back where it was on close, unless it was scrolled since', () => {
        addStickyBar(60);
        const first = renderHook(
            () => useRailIntoView({ current: railAt(-200) }),
            { wrapper },
        );
        window.scrollY = 97;
        document.body.innerHTML = '';
        const frame = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                callback(0);
                return 0;
            });
        first.unmount();
        expect(scrollTo).toHaveBeenLastCalledWith({ top: 600 });

        scrollTo.mockClear();
        window.scrollY = 600;
        addStickyBar(60);
        const second = renderHook(
            () => useRailIntoView({ current: railAt(-200) }),
            { wrapper },
        );
        window.scrollY = 300;
        document.body.innerHTML = '';
        second.unmount();
        expect(scrollTo).toHaveBeenCalledTimes(1);
        frame.mockRestore();
    });

    it('keeps the scroll when the rail is still on the page, as a remount in development', () => {
        addStickyBar(60);
        const view = renderHook(
            () => useRailIntoView({ current: railAt(-200) }),
            { wrapper },
        );
        window.scrollY = 97;
        const frame = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                callback(0);
                return 0;
            });
        view.unmount();
        expect(scrollTo).toHaveBeenCalledTimes(1);
        frame.mockRestore();
    });
});
