import { useCallback, useEffect, useRef } from 'react';

const THRESHOLD = 80;
const MAX_SPEED = 18;

const easedSpeed = (dist: number) =>
    MAX_SPEED * (1 - Math.max(0, dist) / THRESHOLD);

/**
 * Scrolls the window vertically while the user drags or resizes a dashboard
 * tile against the top or bottom of the viewport. The closer the pointer is
 * to the edge, the faster the scroll.
 */
export const useAutoScrollOnDrag = () => {
    const rafRef = useRef<number | null>(null);
    const pointerYRef = useRef<number | null>(null);
    const activeRef = useRef(false);

    const handlePointerMove = useCallback((event: PointerEvent) => {
        pointerYRef.current = event.clientY;
    }, []);

    const stop = useCallback(() => {
        if (!activeRef.current) return;
        activeRef.current = false;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        document.removeEventListener('pointermove', handlePointerMove);
        pointerYRef.current = null;
    }, [handlePointerMove]);

    const tick = useCallback(() => {
        if (!activeRef.current) return;

        const y = pointerYRef.current;
        if (y !== null) {
            const topDist = y;
            const bottomDist = window.innerHeight - y;

            let delta = 0;
            if (topDist < THRESHOLD) {
                delta = -easedSpeed(topDist);
            } else if (bottomDist < THRESHOLD) {
                delta = easedSpeed(bottomDist);
            }

            if (delta !== 0) {
                window.scrollBy(0, delta);
            }
        }

        rafRef.current = requestAnimationFrame(tick);
    }, []);

    const start = useCallback(() => {
        if (activeRef.current) return;
        activeRef.current = true;
        document.addEventListener('pointermove', handlePointerMove, {
            passive: true,
        });
        rafRef.current = requestAnimationFrame(tick);
    }, [handlePointerMove, tick]);

    useEffect(() => stop, [stop]);

    return { start, stop };
};
