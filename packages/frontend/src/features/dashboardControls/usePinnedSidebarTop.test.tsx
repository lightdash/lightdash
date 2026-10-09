import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BANNER_HEIGHT,
    NAVBAR_HEIGHT,
} from '../../components/common/Page/constants';
import FullscreenContext from '../../providers/Fullscreen/context';
import {
    getPinnedSidebarTop,
    usePinnedSidebarTop,
} from './usePinnedSidebarTop';

const VAR = '--pinned-sidebar-top';
const pinnedTop = () => document.documentElement.style.getPropertyValue(VAR);

const wrapper =
    (isFullscreen: boolean): FC<PropsWithChildren> =>
    ({ children }) => (
        <FullscreenContext.Provider
            value={{ enabled: true, isFullscreen, toggleFullscreen: vi.fn() }}
        >
            {children}
        </FullscreenContext.Provider>
    );

// What the navbar renders: its root says whether a banner is shown
const addNavbar = (hasBanner: boolean) => {
    const navbar = document.createElement('div');
    navbar.id = 'navbar-header';
    navbar.setAttribute('data-has-banner', String(hasBanner));
    document.body.appendChild(navbar);
    return navbar;
};

describe('usePinnedSidebarTop', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
            (callback) => {
                callback(0);
                return 0;
            },
        );
    });
    afterEach(() => vi.restoreAllMocks());

    it('follows the navbar until it has scrolled away', () => {
        expect(
            getPinnedSidebarTop({
                scrollY: 0,
                hasBanner: false,
                isFullscreen: false,
            }),
        ).toBe(NAVBAR_HEIGHT);
        expect(
            getPinnedSidebarTop({
                scrollY: 20,
                hasBanner: false,
                isFullscreen: false,
            }),
        ).toBe(NAVBAR_HEIGHT - 20);
        expect(
            getPinnedSidebarTop({
                scrollY: 5000,
                hasBanner: false,
                isFullscreen: false,
            }),
        ).toBe(0);
    });

    it('stays under the fixed banner, however far the page scrolls', () => {
        expect(
            getPinnedSidebarTop({
                scrollY: 0,
                hasBanner: true,
                isFullscreen: false,
            }),
        ).toBe(BANNER_HEIGHT + NAVBAR_HEIGHT);
        expect(
            getPinnedSidebarTop({
                scrollY: 5000,
                hasBanner: true,
                isFullscreen: false,
            }),
        ).toBe(BANNER_HEIGHT);
    });

    it('leaves no room for a navbar in fullscreen', () => {
        expect(
            getPinnedSidebarTop({
                scrollY: 0,
                hasBanner: false,
                isFullscreen: true,
            }),
        ).toBe(0);
        expect(
            getPinnedSidebarTop({
                scrollY: 0,
                hasBanner: true,
                isFullscreen: true,
            }),
        ).toBe(BANNER_HEIGHT);
    });

    it('reads the banner from the navbar and the navbar from fullscreen', () => {
        addNavbar(true);
        const { unmount } = renderHook(() => usePinnedSidebarTop(), {
            wrapper: wrapper(false),
        });
        expect(pinnedTop()).toBe(`${BANNER_HEIGHT + NAVBAR_HEIGHT}px`);
        unmount();
        expect(pinnedTop()).toBe('');

        renderHook(() => usePinnedSidebarTop(), { wrapper: wrapper(true) });
        expect(pinnedTop()).toBe(`${BANNER_HEIGHT}px`);
    });

    it('follows a banner that arrives after the page', async () => {
        const navbar = addNavbar(false);
        renderHook(() => usePinnedSidebarTop(), { wrapper: wrapper(false) });
        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT}px`);

        await act(async () => {
            navbar.setAttribute('data-has-banner', 'true');
            // Mutation records are delivered in a microtask
            await Promise.resolve();
        });

        expect(pinnedTop()).toBe(`${BANNER_HEIGHT + NAVBAR_HEIGHT}px`);
    });

    it('goes by the navbar alone when there is none to ask', () => {
        renderHook(() => usePinnedSidebarTop(), { wrapper: wrapper(false) });
        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT}px`);
    });

    it('counts a page mounted outside the fullscreen provider as not fullscreen', () => {
        const { unmount } = renderHook(() => usePinnedSidebarTop());

        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT}px`);
        unmount();
    });
});
