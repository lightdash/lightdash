import { createContext, useContext } from 'react';

/**
 * Number of tiles to reveal per animation frame.
 * Using 1 tile per frame ensures each tile gets its own paint cycle,
 * which is critical for heavy tiles like 10k-row tables that can
 * block the main thread for hundreds of milliseconds.
 */
export const STAGED_MOUNT_BATCH_SIZE = 1;

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
