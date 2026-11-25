import {
    type ExternalConnectionRateLimitUsage,
    type LiveSourceRateLimitSettings,
} from '@lightdash/common';
import { type LiveRateLimits } from '../../../services/QuerySourceService/live/spec/types';
import { type ApiSourceRateUsageSnapshot } from '../../models/ExternalConnectionModel';

/**
 * Lightdash's usage of each limit in force, from the gate's stored state.
 * A bucket whose window has ended shows its full capacity, and only a hold
 * still in force counts as the vendor pausing the integration.
 */
export const toRateLimitUsage = ({
    integrationLabel,
    rateLimits,
    declared,
    adminRateLimits,
    callsPerQuery,
    snapshot,
}: {
    integrationLabel: string;
    /** The limits in force. */
    rateLimits: LiveRateLimits;
    /** The integration's own limits. */
    declared: LiveRateLimits;
    adminRateLimits: LiveSourceRateLimitSettings | null;
    callsPerQuery: number;
    snapshot: ApiSourceRateUsageSnapshot;
}): ExternalConnectionRateLimitUsage => {
    const now = snapshot.now.getTime();
    const rows = new Map(
        snapshot.buckets.map((bucket) => [bucket.bucketId, bucket]),
    );
    const buckets = [...rateLimits.buckets]
        .sort((a, b) => a.windowMs - b.windowMs)
        .map((bucket) => {
            const row = rows.get(bucket.id);
            const windowEndsAt = row
                ? row.windowStartedAt.getTime() + bucket.windowMs
                : null;
            const isOpen = windowEndsAt !== null && windowEndsAt > now;
            return {
                id: bucket.id,
                label: bucket.label,
                windowMs: bucket.windowMs,
                capacity: bucket.capacity,
                defaultCapacity:
                    declared.buckets.find(({ id }) => id === bucket.id)
                        ?.capacity ?? null,
                used: isOpen && row ? Math.min(row.used, bucket.capacity) : 0,
                resetsAt:
                    isOpen && windowEndsAt !== null
                        ? new Date(windowEndsAt).toISOString()
                        : null,
            };
        });
    // Holds sit on the buckets the limited call charged; the latest one counts
    const limitedUntil = snapshot.buckets.reduce<number | null>(
        (latest, { limitedUntil: until }) =>
            until && until.getTime() > now
                ? Math.max(latest ?? 0, until.getTime())
                : latest,
        null,
    );
    return {
        integrationLabel,
        checkedAt: snapshot.now.toISOString(),
        buckets,
        limitedUntil:
            limitedUntil === null ? null : new Date(limitedUntil).toISOString(),
        adminRateLimits,
        defaultCallsPerSecond: declared.callsPerSecond,
        defaultConcurrentCalls: declared.concurrentCalls,
        note: declared.cardNote ?? null,
        callsPerQuery,
    };
};
