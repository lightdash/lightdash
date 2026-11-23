import { type HydraApiSource, type HydraRateLimits } from '@lightdash/common';
import { type LiveRateLimits } from '../../spec/types';

// The gate always caps calls in flight; "no cap" is one no test reaches
const UNCAPPED_CONCURRENT_CALLS = 100;

const WINDOW_LABELS: Record<number, string> = {
    1_000: 'per second',
    60_000: 'per minute',
    3_600_000: 'per hour',
    86_400_000: 'per day',
};

const toLiveRateLimits = ({
    concurrentCalls,
    callsPerSecond,
    buckets,
}: HydraRateLimits): LiveRateLimits => ({
    concurrentCalls: concurrentCalls ?? UNCAPPED_CONCURRENT_CALLS,
    callsPerSecond,
    buckets: buckets.map((bucket) => ({
        ...bucket,
        label: WINDOW_LABELS[bucket.windowMs] ?? `per ${bucket.windowMs} ms`,
    })),
});

/**
 * The limits the rate-limit gate keeps a Hydra source's calls under: its
 * vendor limits, its own, or none. Set them apart from the vendor's to test
 * the gate against an API stricter or looser than declared.
 */
export const getHydraDeclaredLimits = ({
    vendorLimits,
    declaredLimits,
}: HydraApiSource): LiveRateLimits => {
    const declared =
        declaredLimits === 'vendor' ? vendorLimits : declaredLimits;
    return toLiveRateLimits(
        declared ?? {
            concurrentCalls: null,
            callsPerSecond: null,
            buckets: [],
        },
    );
};
