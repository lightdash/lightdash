import { useMemo, type FC, type ReactNode } from 'react';
import useApp from '../../../providers/App/useApp';
import { TileQueryQueue } from './TileQueryQueue';
import { TileQueryQueueContext } from './useTileQueryQueue';

/**
 * Caps concurrent tile queries for the dashboard below it when the instance
 * sets LIGHTDASH_DASHBOARD_MAX_CONCURRENT_TILE_QUERIES. Screenshot pages leave
 * it out so every tile loads for the capture. Tiles read the cap when their
 * query starts, so render this only once health has loaded.
 */
const TileQueryQueueProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { health } = useApp();
    const maxConcurrent = health.data?.dashboard.maxConcurrentTileQueries;

    const queue = useMemo(
        () => (maxConcurrent ? new TileQueryQueue(maxConcurrent) : null),
        [maxConcurrent],
    );

    return (
        <TileQueryQueueContext.Provider value={queue}>
            {children}
        </TileQueryQueueContext.Provider>
    );
};

export default TileQueryQueueProvider;
