import { performance } from 'node:perf_hooks';
import Logger from '../logging/logger';

const STALL_THRESHOLD_MS = 1000;
const SAMPLE_INTERVAL_MS = 100;

export const startEventLoopStallDetector = (
    getRunningQueryUuids: () => string[],
): (() => void) => {
    let previousSample = performance.now();
    const timer = setInterval(() => {
        const now = performance.now();
        const stallMs = now - previousSample - SAMPLE_INTERVAL_MS;
        previousSample = now;
        if (stallMs > STALL_THRESHOLD_MS) {
            Logger.warn('NATS worker event-loop stall', {
                stallMs: Math.round(stallMs),
                runningQueryUuids: getRunningQueryUuids(),
            });
        }
    }, SAMPLE_INTERVAL_MS);
    timer.unref();
    return () => clearInterval(timer);
};
