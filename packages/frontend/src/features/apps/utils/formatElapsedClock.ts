/**
 * A running build's elapsed time, as a clock rather than a duration: `0:12`.
 * Counts up, so it reads as something still happening — a finished build gets
 * `formatBuildDuration` ("44s") instead.
 */
export const formatElapsedClock = (elapsedMs: number): string => {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
