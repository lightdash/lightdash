import { createContext, useContext } from 'react';

/**
 * Number of tiles to reveal per animation frame.
 * 3 tiles x ~50ms each = ~150ms per frame, keeping interactions responsive.
 */
export const STAGED_MOUNT_BATCH_SIZE = 3;

type StagedMountContextValue = {
    revealedCount: number;
};

export const StagedMountContext = createContext<StagedMountContextValue>({
    revealedCount: Infinity,
});

/**
 * Returns whether this tile should render its real content or a skeleton.
 * Tiles are revealed in order of their index, BATCH_SIZE per animation frame.
 */
export const useStagedMount = (tileIndex: number): { isReady: boolean } => {
    const { revealedCount } = useContext(StagedMountContext);
    return { isReady: tileIndex < revealedCount };
};
