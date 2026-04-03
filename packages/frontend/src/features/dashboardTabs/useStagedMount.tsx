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
    /** Unique key that resets the cascade (typically the active tab UUID). */
    waveKey: string;
    /** Whether this tab is currently active. Pauses the cascade when false. */
    isActive: boolean;
}>;

/**
 * Drives a progressive cascade that reveals tiles in batches.
 * Resets whenever `waveKey` changes (e.g. tab switch).
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
            if (countRef.current < totalTiles) {
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
