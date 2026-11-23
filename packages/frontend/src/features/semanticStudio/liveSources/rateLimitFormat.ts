import {
    type ExternalConnectionRateLimitBucket,
    type ExternalConnectionRateLimitUsage,
} from '@lightdash/common';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const timeOf = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * When a limit resets, as of when usage was read: seconds or minutes when it
 * is close, a time later today, and a date beyond that.
 */
export const formatResetsAt = (resetsAt: string, checkedAt: string): string => {
    const resets = new Date(resetsAt);
    const checked = new Date(checkedAt);
    const inMs = Math.max(0, resets.getTime() - checked.getTime());
    if (inMs < MINUTE) return `resets in ${Math.ceil(inMs / SECOND)}s`;
    if (inMs < HOUR) return `resets in ${Math.ceil(inMs / MINUTE)} min`;
    if (resets.toDateString() === checked.toDateString()) {
        return `resets at ${timeOf(resets)}`;
    }
    const day = resets.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
    });
    return `resets ${day}, ${timeOf(resets)}`;
};

/** A vendor's pause, such as "until 14:05" or "until 24 Nov, 09:00". */
export const formatUntil = (until: string, checkedAt: string): string => {
    const date = new Date(until);
    if (date.toDateString() === new Date(checkedAt).toDateString()) {
        return `until ${timeOf(date)}`;
    }
    const day = date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
    });
    return `until ${day}, ${timeOf(date)}`;
};

/** Used of capacity, such as "410 of 10,000". */
export const formatUsed = (used: number, capacity: number): string =>
    `${used.toLocaleString()} of ${capacity.toLocaleString()}`;

export const capitalize = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);

export const isFull = (bucket: ExternalConnectionRateLimitBucket) =>
    bucket.used >= bucket.capacity;

export const resetsOf = (
    bucket: ExternalConnectionRateLimitBucket,
    checkedAt: string,
) =>
    bucket.resetsAt
        ? formatResetsAt(bucket.resetsAt, checkedAt)
        : 'No calls in this window';

/**
 * The summary tile: a vendor pause, else the shortest limit that is full
 * (the one holding calls back), else the longest declared limit.
 */
export const getRateLimitStat = (
    usage: ExternalConnectionRateLimitUsage | undefined,
): {
    value: string;
    detail: string | null;
    title?: string;
    limitReached?: boolean;
} => {
    if (!usage) return { value: '—', detail: null };
    if (usage.limitedUntil) {
        return {
            value: 'Paused',
            detail: formatUntil(usage.limitedUntil, usage.checkedAt),
            title: `${usage.integrationLabel} asked Lightdash to slow down`,
            limitReached: true,
        };
    }
    const shown = usage.buckets.find(isFull) ?? usage.buckets.at(-1);
    if (!shown) {
        return { value: '—', detail: null, title: 'No limits declared' };
    }
    const full = isFull(shown);
    const resets = resetsOf(shown, usage.checkedAt);
    return {
        value: formatUsed(shown.used, shown.capacity),
        detail: shown.label,
        title: capitalize(full ? `limit reached, ${resets}` : resets),
        limitReached: full,
    };
};
