import fs from 'fs';
import os from 'os';
import v8 from 'v8';

export type RuntimeMemoryReport = {
    heapLimitBytes: number;
    containerMemoryLimitBytes: number | null;
    nodeOptions: string | null;
    heapFlagSet: boolean;
    availableParallelism: number;
    /** Set when the heap is far below a known container limit, which is the shipping default. */
    warning: string | null;
};

const CONTAINER_LIMIT_PATHS = [
    '/sys/fs/cgroup/memory.max',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes',
];
const MIN_PLAUSIBLE_LIMIT_BYTES = 512 * 1024 * 1024;
const MAX_PLAUSIBLE_LIMIT_BYTES = 1024 * 1024 * 1024 * 1024;

export const readContainerMemoryLimitBytes = (
    readFile: (path: string) => string = (path) =>
        fs.readFileSync(path, 'utf8'),
): number | null => {
    // eslint-disable-next-line no-restricted-syntax
    for (const path of CONTAINER_LIMIT_PATHS) {
        let raw: string;
        try {
            raw = readFile(path).trim();
        } catch {
            // eslint-disable-next-line no-continue
            continue;
        }
        if (raw === 'max' || !/^\d+$/.test(raw)) {
            // eslint-disable-next-line no-continue
            continue;
        }
        const value = Number.parseInt(raw, 10);
        // cgroup v1 reports a near-2^63 sentinel rather than "max" when unlimited.
        if (
            value >= MIN_PLAUSIBLE_LIMIT_BYTES &&
            value <= MAX_PLAUSIBLE_LIMIT_BYTES
        ) {
            return value;
        }
    }
    return null;
};

export const buildRuntimeMemoryReport = ({
    heapLimitBytes = v8.getHeapStatistics().heap_size_limit,
    containerMemoryLimitBytes = readContainerMemoryLimitBytes(),
    nodeOptions = process.env.NODE_OPTIONS ?? null,
    availableParallelism = os.availableParallelism(),
}: Partial<
    Omit<RuntimeMemoryReport, 'warning' | 'heapFlagSet'>
> = {}): RuntimeMemoryReport => {
    const heapFlagSet =
        nodeOptions !== null && nodeOptions.includes('max-old-space-size');

    // Node derives the heap from the container limit in plateaus, not as a fraction: every
    // limit between 4 and 15 GiB yields the same 2,240 MB heap. So raising a pod's memory
    // inside that band changes nothing, and an operator has no way to see that from the pod.
    const heapIsFarBelowLimit =
        containerMemoryLimitBytes !== null &&
        heapLimitBytes < containerMemoryLimitBytes / 2;

    const suggestedMb = containerMemoryLimitBytes
        ? Math.floor((containerMemoryLimitBytes / 1024 / 1024) * 0.75)
        : null;

    return {
        heapLimitBytes,
        containerMemoryLimitBytes,
        nodeOptions,
        heapFlagSet,
        availableParallelism,
        warning:
            !heapFlagSet && heapIsFarBelowLimit
                ? `Node heap limit is ${Math.round(
                      heapLimitBytes / 1024 / 1024,
                  )}MB but the container memory limit is ${Math.round(
                      (containerMemoryLimitBytes ?? 0) / 1024 / 1024,
                  )}MB. Raising the container limit alone may not raise the heap. Set NODE_OPTIONS=--max-old-space-size=${suggestedMb} to use it.`
                : null,
    };
};
