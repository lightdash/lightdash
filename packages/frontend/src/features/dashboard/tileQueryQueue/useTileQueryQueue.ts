import { createContext, useContext, useEffect } from 'react';
import { type TileQueryQueue } from './TileQueryQueue';

const PREFETCH_MARGIN = '200px';

/** Null when tile queries run without a cap. */
export const TileQueryQueueContext = createContext<TileQueryQueue | null>(null);

export const useTileQueryQueue = () => useContext(TileQueryQueueContext);

/** Keeps the queue told whether the tile is on screen. */
export const useTileQueryQueueVisibility = (tileUuid: string) => {
    const queue = useTileQueryQueue();

    useEffect(() => {
        if (!queue) {
            return;
        }
        // The grid owns the tile's element and marks it with data-tile-uuid.
        const gridItem = document.querySelector(
            `[data-tile-uuid="${CSS.escape(tileUuid)}"]`,
        );
        if (!gridItem) {
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => queue.setVisible(tileUuid, entry.isIntersecting),
            { rootMargin: PREFETCH_MARGIN },
        );
        observer.observe(gridItem);
        return () => {
            observer.disconnect();
            queue.setVisible(tileUuid, false);
        };
    }, [queue, tileUuid]);
};
