import {
    useEffect,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import {
    STAGED_MOUNT_BATCH_SIZE,
    StagedMountContext,
} from './stagedMountContext';

type StagedMountProviderProps = PropsWithChildren<{
    /** Total number of tiles on this tab. Used to stop the rAF loop. */
    totalTiles: number;
    /** Stable key that resets the cascade when the mounted tab panel changes. */
    waveKey: string;
    /** Whether this tab is currently active. Pauses the cascade when false. */
    isActive: boolean;
}>;

/**
 * Drives a progressive cascade that reveals tiles in batches.
 * Resets whenever `waveKey` changes (for example, when a tab panel mounts
 * for the first time or is replaced entirely).
 * Pauses the rAF loop when the tab is inactive so hidden tabs
 * don't waste CPU rendering tiles nobody can see.
 */
export const StagedMountProvider: FC<StagedMountProviderProps> = ({
    totalTiles,
    waveKey,
    isActive,
    children,
}) => {
    const [revealedCount, setRevealedCount] = useState(0);
    const rafRef = useRef<number | null>(null);
    const countRef = useRef(0);
    // Ref so the rAF callback can read the latest value without stale closure
    const isActiveRef = useRef(isActive);
    isActiveRef.current = isActive;

    useEffect(() => {
        // Reset cascade on wave key change
        setRevealedCount(0);
        countRef.current = 0;
    }, [waveKey]);

    useEffect(() => {
        // Only run the cascade when active and not yet complete
        if (!isActive || countRef.current >= totalTiles) return;

        const advance = () => {
            countRef.current += STAGED_MOUNT_BATCH_SIZE;
            setRevealedCount(countRef.current);
            if (countRef.current < totalTiles && isActiveRef.current) {
                rafRef.current = requestAnimationFrame(advance);
            }
        };

        // Start/resume cascade on next frame
        rafRef.current = requestAnimationFrame(advance);

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [waveKey, isActive, totalTiles]);

    return (
        <StagedMountContext.Provider value={{ revealedCount }}>
            {children}
        </StagedMountContext.Provider>
    );
};
