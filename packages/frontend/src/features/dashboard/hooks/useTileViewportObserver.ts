import { useCallback, useEffect, useRef } from 'react';
import { dashboardTileLoadingActions } from '../store/dashboardTileLoadingSlice';
import { useDashboardDispatch, useDashboardSelector } from '../store/hooks';
import { selectTileStatus } from '../store/selectors';

/**
 * Observes a tile's DOM element and dispatches `tileEnteredViewport`
 * when it enters the viewport (or a generous margin around it).
 *
 * Returns a ref callback to attach to the tile's wrapper div.
 *
 * Tiles that are already above the fold will fire immediately on mount
 * since IntersectionObserver fires an initial entry for visible elements.
 */
export function useTileViewportObserver(tileUuid: string) {
    const dispatch = useDashboardDispatch();
    const status = useDashboardSelector((state) =>
        selectTileStatus(state, tileUuid),
    );
    const observerRef = useRef<IntersectionObserver | null>(null);
    const elementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        // Only observe while tile is pending
        if (status !== 'pending') {
            // Clean up observer if tile is no longer pending
            if (observerRef.current && elementRef.current) {
                observerRef.current.unobserve(elementRef.current);
            }
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        dispatch(
                            dashboardTileLoadingActions.tileEnteredViewport(
                                tileUuid,
                            ),
                        );
                        // Stop observing once visible
                        observer.unobserve(entry.target);
                    }
                }
            },
            {
                // Start loading tiles 400px before they enter the viewport.
                // This gives queries a head start so tiles are often loaded
                // by the time the user scrolls to them.
                rootMargin: '400px',
            },
        );

        observerRef.current = observer;

        if (elementRef.current) {
            observer.observe(elementRef.current);
        }

        return () => {
            observer.disconnect();
        };
    }, [status, tileUuid, dispatch]);

    // Ref callback for the tile's wrapper element
    const setRef = useCallback(
        (node: HTMLElement | null) => {
            // Unobserve old element
            if (elementRef.current && observerRef.current) {
                observerRef.current.unobserve(elementRef.current);
            }

            elementRef.current = node;

            // Observe new element if we're still pending
            if (node && observerRef.current && status === 'pending') {
                observerRef.current.observe(node);
            }
        },
        [status],
    );

    return setRef;
}
