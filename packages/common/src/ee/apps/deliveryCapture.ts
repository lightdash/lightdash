import isPlainObject from 'lodash/isPlainObject';

/** Cap on distinct captured queries per delivery; overflow beyond this is dropped and counted. */
export const MAX_DELIVERY_QUERIES = 50;

/** Bumped whenever the captureKey hash inputs change, to invalidate stale keys across a deploy. */
export const CAPTURE_KEY_VERSION = 'v1';

/** Labels are display-only; capped at capture time. */
export const MAX_CAPTURE_LABEL_CHARS = 200;

/** Window global MinimalApp publishes and UnfurlService reads. */
export const DELIVERY_CAPTURE_GLOBAL = '__lightdashAppDeliveryCapture';

export type CapturedQuery =
    | {
          status: 'ready';
          captureKey: string;
          label: string;
          exploreName: string | null;
          queryUuid: string;
          order: number;
          rowCount: number | null;
          limitReached: boolean;
      }
    | {
          status: 'error';
          captureKey: string;
          label: string;
          exploreName: string | null;
          queryUuid: string | null;
          order: number;
          error: string;
      };

export type DeliveryCaptureManifest = {
    version: 1;
    items: CapturedQuery[];
    overflowCount: number;
};

const isNullableString = (value: unknown): value is string | null =>
    value === null || typeof value === 'string';

const isNullableNumber = (value: unknown): value is number | null =>
    value === null || typeof value === 'number';

const parseCapturedQuery = (value: unknown): CapturedQuery | null => {
    if (!isPlainObject(value)) return null;
    const candidate = value as Record<string, unknown>;

    const { status, captureKey, label, exploreName, order } = candidate;

    if (typeof captureKey !== 'string') return null;
    if (typeof label !== 'string' || label.length > MAX_CAPTURE_LABEL_CHARS) {
        return null;
    }
    if (!isNullableString(exploreName)) return null;
    if (typeof order !== 'number') return null;

    if (status === 'ready') {
        const { queryUuid, rowCount, limitReached } = candidate;
        if (typeof queryUuid !== 'string') return null;
        if (!isNullableNumber(rowCount)) return null;
        if (typeof limitReached !== 'boolean') return null;
        return {
            status: 'ready',
            captureKey,
            label,
            exploreName,
            queryUuid,
            order,
            rowCount,
            limitReached,
        };
    }

    if (status === 'error') {
        const { queryUuid, error } = candidate;
        if (!isNullableString(queryUuid)) return null;
        if (typeof error !== 'string') return null;
        return {
            status: 'error',
            captureKey,
            label,
            exploreName,
            queryUuid,
            order,
            error,
        };
    }

    return null;
};

/**
 * Fail-closed validator for the manifest MinimalApp publishes on
 * `DELIVERY_CAPTURE_GLOBAL` and UnfurlService reads via page.evaluate. Any
 * structural mismatch returns `null` — callers must treat that as a hard
 * failure, not an empty manifest.
 */
export const parseDeliveryCaptureManifest = (
    value: unknown,
): DeliveryCaptureManifest | null => {
    if (!isPlainObject(value)) return null;
    const candidate = value as Record<string, unknown>;

    if (candidate.version !== 1) return null;
    if (!Array.isArray(candidate.items)) return null;
    if (candidate.items.length > MAX_DELIVERY_QUERIES) return null;
    if (
        typeof candidate.overflowCount !== 'number' ||
        candidate.overflowCount < 0
    ) {
        return null;
    }

    const items: CapturedQuery[] = [];
    for (const item of candidate.items) {
        const parsed = parseCapturedQuery(item);
        if (!parsed) return null;
        items.push(parsed);
    }

    return {
        version: 1,
        items,
        overflowCount: candidate.overflowCount,
    };
};
