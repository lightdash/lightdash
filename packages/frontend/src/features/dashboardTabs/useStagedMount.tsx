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
}>;

/**
 * Drives a progressive cascade that reveals tiles in batches.
 * Resets whenever `waveKey` changes (e.g. tab switch).
 */
export const StagedMountProvider: FC<StagedMountProviderProps> = ({
    totalTiles,
    waveKey,
    children,
}) => {
    const [revealedCount, setRevealedCount] = useState(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        // Reset cascade on wave key change
        setRevealedCount(0);

        const startTime = performance.now();
        performance.mark(`staged-mount-start-${waveKey}`);
        console.log(
            `[StagedMount] 🚀 Starting cascade for tab ${waveKey} (${totalTiles} tiles, batch size ${STAGED_MOUNT_BATCH_SIZE})`,
        );

        let count = 0;
        let frame = 0;
        const advance = () => {
            count += STAGED_MOUNT_BATCH_SIZE;
            frame++;
            const elapsed = (performance.now() - startTime).toFixed(1);
            console.log(
                `[StagedMount] Frame ${frame}: revealing tiles ${count - STAGED_MOUNT_BATCH_SIZE}-${Math.min(count, totalTiles) - 1} (${elapsed}ms elapsed)`,
            );
            setRevealedCount(count);
            if (count < totalTiles) {
                rafRef.current = requestAnimationFrame(advance);
            } else {
                performance.mark(`staged-mount-end-${waveKey}`);
                performance.measure(
                    `staged-mount-${waveKey}`,
                    `staged-mount-start-${waveKey}`,
                    `staged-mount-end-${waveKey}`,
                );
                console.log(
                    `[StagedMount] ✅ Cascade complete: ${totalTiles} tiles in ${frame} frames (${elapsed}ms)`,
                );
            }
        };

        // Start cascade on next frame so the skeleton grid paints first
        rafRef.current = requestAnimationFrame(advance);

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [waveKey, totalTiles]);

    return (
        <StagedMountContext.Provider value={{ revealedCount }}>
            {children}
        </StagedMountContext.Provider>
    );
};
