import { useEffect } from 'react';
import { NAVBAR_HEIGHT } from '../../components/common/Page/constants';

const VAR = '--pinned-sidebar-top';

// The page scrolls as a whole and the navbar scrolls away with it, so the
// pinned sidebar follows the navbar's bottom edge until that reaches the top.
export const usePinnedSidebarTop = () => {
    useEffect(() => {
        const root = document.documentElement;
        let frame: number | null = null;
        const update = () => {
            frame = null;
            const top = Math.max(0, NAVBAR_HEIGHT - window.scrollY);
            root.style.setProperty(VAR, `${top}px`);
        };
        const onScroll = () => {
            if (frame === null) frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (frame !== null) cancelAnimationFrame(frame);
            root.style.removeProperty(VAR);
        };
    }, []);
};
