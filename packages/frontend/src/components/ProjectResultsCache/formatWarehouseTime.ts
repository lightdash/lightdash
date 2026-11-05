const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const formatWarehouseTime = (ms: number): string => {
    if (ms < SECOND_MS) return `${Math.round(ms)}ms`;
    if (ms < MINUTE_MS) return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`;
    if (ms < HOUR_MS) {
        const totalSeconds = Math.floor(ms / SECOND_MS);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }
    return `${(ms / HOUR_MS).toFixed(1)}h`;
};
