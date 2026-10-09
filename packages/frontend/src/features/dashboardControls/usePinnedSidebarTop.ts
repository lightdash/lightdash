import { useContext, useEffect } from 'react';
import {
    BANNER_HEIGHT,
    NAVBAR_HEIGHT,
} from '../../components/common/Page/constants';
import FullscreenContext from '../../providers/Fullscreen/context';

const VAR = '--pinned-sidebar-top';
// The navbar says on its root whether it shows a banner (`components/NavBar`)
const NAVBAR_ID = 'navbar-header';
const BANNER_ATTRIBUTE = 'data-has-banner';

// The banner is fixed at the top and the navbar scrolls away under it. In
// fullscreen there is no navbar at all
export const getPinnedSidebarTop = ({
    scrollY,
    hasBanner,
    isFullscreen,
}: {
    scrollY: number;
    hasBanner: boolean;
    isFullscreen: boolean;
}): number =>
    (hasBanner ? BANNER_HEIGHT : 0) +
    (isFullscreen ? 0 : Math.max(0, NAVBAR_HEIGHT - scrollY));

// The page scrolls as a whole and the navbar scrolls away with it, so the
// pinned sidebar follows the navbar's bottom edge until that reaches the top.
export const usePinnedSidebarTop = () => {
    // Read without the hook: a page mounted outside the provider is not fullscreen
    const isFullscreen = useContext(FullscreenContext)?.isFullscreen ?? false;
    useEffect(() => {
        const root = document.documentElement;
        const navbar = document.getElementById(NAVBAR_ID);
        let frame: number | null = null;
        const update = () => {
            frame = null;
            const top = getPinnedSidebarTop({
                scrollY: window.scrollY,
                hasBanner: navbar?.getAttribute(BANNER_ATTRIBUTE) === 'true',
                isFullscreen,
            });
            root.style.setProperty(VAR, `${top}px`);
        };
        const schedule = () => {
            if (frame === null) frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', schedule, { passive: true });
        // A banner can arrive after the page: the project loads later
        const observer = new MutationObserver(schedule);
        if (navbar !== null) {
            observer.observe(navbar, {
                attributes: true,
                attributeFilter: [BANNER_ATTRIBUTE],
            });
        }
        return () => {
            window.removeEventListener('scroll', schedule);
            observer.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
            root.style.removeProperty(VAR);
        };
    }, [isFullscreen]);
};
