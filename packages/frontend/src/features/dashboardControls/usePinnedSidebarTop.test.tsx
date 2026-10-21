import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BANNER_HEIGHT,
    NAVBAR_HEIGHT,
} from '../../components/common/Page/constants';
import { usePinnedSidebarTop } from './usePinnedSidebarTop';

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

const setScrollY = (scrollY: number) =>
    Object.defineProperty(window, 'scrollY', {
        value: scrollY,
        configurable: true,
    });
const frames: FrameRequestCallback[] = [];
const runFrames = () => frames.splice(0).forEach((frame) => frame(0));
const scrollTo = (scrollY: number) =>
    act(() => {
        setScrollY(scrollY);
        window.dispatchEvent(new Event('scroll'));
        runFrames();
    });

describe('usePinnedSidebarTop', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setScrollY(0);
        frames.length = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
            (callback) => frames.push(callback),
        );
    });
    afterEach(() => vi.restoreAllMocks());

    it('follows the navbar until it has scrolled away', () => {
        addNavbar(false);
        renderHook(() => usePinnedSidebarTop());
        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT}px`);

        scrollTo(20);
        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT - 20}px`);

        scrollTo(5000);
        expect(pinnedTop()).toBe('0px');
    });

    it('stays under the fixed banner, however far the page scrolls', () => {
        addNavbar(true);
        renderHook(() => usePinnedSidebarTop());

        scrollTo(5000);
        expect(pinnedTop()).toBe(`${BANNER_HEIGHT}px`);
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
            runFrames();
        });

        expect(pinnedTop()).toBe(`${BANNER_HEIGHT + NAVBAR_HEIGHT}px`);
    });

    it('goes by the navbar alone when there is none to ask', () => {
        renderHook(() => usePinnedSidebarTop());
        expect(pinnedTop()).toBe(`${NAVBAR_HEIGHT}px`);
    });
});
