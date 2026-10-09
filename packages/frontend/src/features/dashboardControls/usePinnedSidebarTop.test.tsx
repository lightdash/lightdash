import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BANNER_HEIGHT,
    NAVBAR_HEIGHT,
} from '../../components/common/Page/constants';
import {
    getPinnedSidebarTop,
    usePinnedSidebarTop,
} from './usePinnedSidebarTop';

const VAR = '--pinned-sidebar-top';
const pinnedTop = () => document.documentElement.style.getPropertyValue(VAR);

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
            }),
        ).toBe(NAVBAR_HEIGHT);
        expect(
            getPinnedSidebarTop({
                scrollY: 20,
                hasBanner: false,
            }),
        ).toBe(NAVBAR_HEIGHT - 20);
        expect(
            getPinnedSidebarTop({
                scrollY: 5000,
                hasBanner: false,
            }),
        ).toBe(0);
    });

    it('stays under the fixed banner, however far the page scrolls', () => {
        expect(
            getPinnedSidebarTop({
                scrollY: 0,
                hasBanner: true,
            }),
        ).toBe(BANNER_HEIGHT + NAVBAR_HEIGHT);
        expect(
            getPinnedSidebarTop({
                scrollY: 5000,
                hasBanner: true,
            }),
        ).toBe(BANNER_HEIGHT);
    });

    it('reads the banner from the navbar, and clears up after itself', () => {
        addNavbar(true);
        const { unmount } = renderHook(() => usePinnedSidebarTop());
        expect(pinnedTop()).toBe(`${BANNER_HEIGHT + NAVBAR_HEIGHT}px`);
        unmount();
        expect(pinnedTop()).toBe('');
    });

    it('follows a banner that arrives after the page', async () => {
        const navbar = addNavbar(false);
        renderHook(() => usePinnedSidebarTop());
        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT}px`);

        await act(async () => {
            navbar.setAttribute('data-has-banner', 'true');
            // Mutation records are delivered in a microtask
            await Promise.resolve();
        });

        expect(pinnedTop()).toBe(`${BANNER_HEIGHT + NAVBAR_HEIGHT}px`);
    });

    it('goes by the navbar alone when there is none to ask', () => {
        renderHook(() => usePinnedSidebarTop());
        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT}px`);
    });
});
