/**
 * Render a build duration the way the thread's receipt reads it: seconds up to
 * a minute, then minutes and seconds. Sub-second builds round up to `1s` rather
 * than claiming `0s`.
 */
export const formatBuildDuration = (durationMs: number): string => {
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};
