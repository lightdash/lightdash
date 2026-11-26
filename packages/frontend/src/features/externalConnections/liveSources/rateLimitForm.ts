/**
 * The limits an admin can lower on a live data source, as rows of a form from
 * the smallest span to the largest: concurrency, calls a second where the
 * integration limits it, then one per time window, with a daily one on every
 * integration.
 */
import {
    assertUnreachable,
    LIVE_SOURCE_DAILY_RATE_LIMIT,
    LIVE_SOURCE_RATE_LIMIT_MAX,
    type ExternalConnectionRateLimitBucket,
    type ExternalConnectionRateLimitUsage,
    type LiveSourceRateLimitSettings,
} from '@lightdash/common';
import {
    capitalize,
    formatUsed,
    formatWindow,
    isFull,
    resetsOf,
} from './rateLimitFormat';

type RateLimitKind =
    /** `usage` is null for a daily limit that isn't set yet. */
    | {
          kind: 'window';
          bucketId: string;
          windowMs: number;
          usage: ExternalConnectionRateLimitBucket | null;
      }
    | { kind: 'callsPerSecond' }
    | { kind: 'concurrentCalls' };

export type RateLimitRow = RateLimitKind & {
    key: string;
    label: string;
    /** The integration's own limit; null for a daily limit it doesn't have. */
    defaultLimit: number | null;
    /** The admin's saved limit, never shown above the integration's own. */
    savedLimit: number | undefined;
};

/** What each row holds; undefined leaves the integration's limit. */
export type RateLimitValues = Record<string, number | undefined>;

const isDaily = ({ windowMs }: { windowMs: number }) =>
    windowMs === LIVE_SOURCE_DAILY_RATE_LIMIT.windowMs;

const clampSaved = (
    saved: number | null | undefined,
    defaultLimit: number | null,
): number | undefined =>
    typeof saved === 'number'
        ? Math.min(saved, defaultLimit ?? saved)
        : undefined;

export const getRateLimitRows = ({
    buckets,
    adminRateLimits,
    defaultCallsPerSecond,
    defaultConcurrentCalls,
}: ExternalConnectionRateLimitUsage): RateLimitRow[] => {
    const toWindowRow = (
        {
            id,
            label,
            windowMs,
        }: { id: string; label: string; windowMs: number },
        usage: ExternalConnectionRateLimitBucket | null,
        saved: number | undefined,
    ): RateLimitRow => {
        const defaultLimit = usage?.defaultCapacity ?? null;
        return {
            kind: 'window',
            key: `window:${id}`,
            bucketId: id,
            windowMs,
            label: capitalize(label),
            usage,
            defaultLimit,
            savedLimit: clampSaved(saved, defaultLimit),
        };
    };
    const declared = buckets.map((bucket) => ({
        windowMs: bucket.windowMs,
        row: toWindowRow(
            bucket,
            bucket,
            adminRateLimits?.buckets[bucket.id] ??
                (isDaily(bucket)
                    ? adminRateLimits?.buckets[LIVE_SOURCE_DAILY_RATE_LIMIT.id]
                    : undefined),
        ),
    }));
    const unsetDaily = buckets.some(isDaily)
        ? []
        : [
              {
                  windowMs: LIVE_SOURCE_DAILY_RATE_LIMIT.windowMs,
                  row: toWindowRow(
                      LIVE_SOURCE_DAILY_RATE_LIMIT,
                      null,
                      undefined,
                  ),
              },
          ];
    const windows = [...declared, ...unsetDaily]
        .sort((a, b) => a.windowMs - b.windowMs)
        .map(({ row }) => row);
    const perSecond: RateLimitRow[] =
        defaultCallsPerSecond === null
            ? []
            : [
                  {
                      kind: 'callsPerSecond',
                      key: 'callsPerSecond',
                      label: 'Per second',
                      defaultLimit: defaultCallsPerSecond,
                      savedLimit: clampSaved(
                          adminRateLimits?.callsPerSecond,
                          defaultCallsPerSecond,
                      ),
                  },
              ];
    return [
        {
            kind: 'concurrentCalls',
            key: 'concurrentCalls',
            label: 'Concurrent requests',
            defaultLimit: defaultConcurrentCalls,
            savedLimit: clampSaved(
                adminRateLimits?.concurrentCalls,
                defaultConcurrentCalls,
            ),
        },
        ...perSecond,
        ...windows,
    ];
};

export const getSavedValues = (rows: RateLimitRow[]): RateLimitValues =>
    Object.fromEntries(rows.map(({ key, savedLimit }) => [key, savedLimit]));

export const getMaxLimit = ({ defaultLimit }: RateLimitRow): number =>
    defaultLimit ?? LIVE_SOURCE_RATE_LIMIT_MAX;

export const isValidLimit = (
    row: RateLimitRow,
    value: number | undefined,
): boolean =>
    value === undefined ||
    (Number.isInteger(value) && value >= 1 && value <= getMaxLimit(row));

/**
 * The line under a row's label: how the limit behaves, and for a window that
 * is counting, when it resets.
 */
export const getRateLimitHint = (
    row: RateLimitRow,
    checkedAt: string,
): string => {
    switch (row.kind) {
        case 'window': {
            if (!row.usage?.resetsAt) {
                return `${formatWindow(row.windowMs)} from the first request`;
            }
            const resets = resetsOf(row.usage, checkedAt);
            return isFull(row.usage)
                ? `Limit reached, ${resets}`
                : capitalize(resets);
        }
        case 'callsPerSecond':
            return 'Paced evenly, extra requests queue';
        case 'concurrentCalls':
            return 'How many run at once; the rest wait';
        default:
            return assertUnreachable(row, 'Unknown rate limit row');
    }
};

/** A row's progress bar and the words beside it. */
export type RateLimitMeter = {
    text: string;
    /** From 0 to 100; 0 where nothing is counted. */
    percent: number;
    isCounted: boolean;
    isFull: boolean;
};

/** Describes the limit now in force, so an unsaved edit leaves it alone. */
export const getRateLimitMeter = (
    row: RateLimitRow,
    runningCalls: number,
): RateLimitMeter => {
    const counted = (used: number, capacity: number): RateLimitMeter => ({
        text: formatUsed(used, capacity),
        percent: Math.min(100, (used / capacity) * 100),
        isCounted: true,
        isFull: used >= capacity,
    });
    const uncounted = (text: string): RateLimitMeter => ({
        text,
        percent: 0,
        isCounted: false,
        isFull: false,
    });
    const inForce = row.savedLimit ?? getMaxLimit(row);

    switch (row.kind) {
        case 'window':
            return row.usage
                ? counted(row.usage.used, row.usage.capacity)
                : uncounted('Uncapped');
        case 'callsPerSecond':
            return uncounted(`Up to ${inForce.toLocaleString()}`);
        case 'concurrentCalls':
            return counted(runningCalls, inForce);
        default:
            return assertUnreachable(row, 'Unknown rate limit row');
    }
};

export const toRateLimitSettings = (
    rows: RateLimitRow[],
    values: RateLimitValues,
): LiveSourceRateLimitSettings => {
    const valueOf = (kind: RateLimitRow['kind']) =>
        values[rows.find((row) => row.kind === kind)?.key ?? ''] ?? null;
    return {
        buckets: Object.fromEntries(
            rows.flatMap((row) => {
                const value = values[row.key];
                return row.kind === 'window' && value !== undefined
                    ? [[row.bucketId, value]]
                    : [];
            }),
        ),
        callsPerSecond: valueOf('callsPerSecond'),
        concurrentCalls: valueOf('concurrentCalls'),
    };
};
