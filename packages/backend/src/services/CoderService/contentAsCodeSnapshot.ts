import {
    type ChartAsCode,
    type DashboardAsCode,
    type SqlChartAsCode,
} from '@lightdash/common';
import { createHash } from 'crypto';

export type SnapshotAsCodeContent =
    | ChartAsCode
    | DashboardAsCode
    | SqlChartAsCode;

type CanonicalJsonValue =
    | string
    | number
    | boolean
    | null
    | CanonicalJsonValue[]
    | { [key: string]: CanonicalJsonValue };

// updatedAt/downloadedAt are transport metadata and verification is runtime
// instance state; the snapshot records only the declarative document.
const STRIPPED_KEYS: ReadonlySet<string> = new Set([
    'updatedAt',
    'downloadedAt',
    'verification',
]);

// Deep-sorts keys and serialises dates so that structurally equal documents
// always canonicalize and hash identically.
//
// Absent, null and empty all collapse to absent, because the instance
// materialises defaults that a hand-authored file omits: a chart with no
// custom dimensions reads `customDimensions: []` from the API and
// `customDimensions: null` from a downloaded file, while a file written by
// hand has no such key at all. Without collapsing them, three spellings of
// "not set" hash differently and fast_forward is unreachable, so every
// unchanged upload reads as drifted.
const canonicalize = (value: unknown): CanonicalJsonValue | undefined => {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        const items = value
            .map(canonicalize)
            .filter((item): item is CanonicalJsonValue => item !== undefined);
        return items.length === 0 ? undefined : items;
    }
    if (typeof value === 'object') {
        const entries = Object.keys(value)
            .sort()
            .reduce<Record<string, CanonicalJsonValue>>((acc, key) => {
                const child = canonicalize(
                    (value as Record<string, unknown>)[key],
                );
                if (child !== undefined) {
                    acc[key] = child;
                }
                return acc;
            }, {});
        return Object.keys(entries).length === 0 ? undefined : entries;
    }
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }
    throw new Error(`Cannot canonicalize value of type ${typeof value}`);
};

export const buildContentAsCodeSnapshot = (
    content: SnapshotAsCodeContent,
): {
    snapshot: Record<string, CanonicalJsonValue>;
    snapshotHash: string;
} => {
    const declarative: Record<string, unknown> = Object.fromEntries(
        Object.entries(content).filter(([key]) => !STRIPPED_KEYS.has(key)),
    );
    const snapshot = Object.keys(declarative)
        .sort()
        .reduce<Record<string, CanonicalJsonValue>>((acc, key) => {
            const child = canonicalize(declarative[key]);
            if (child !== undefined) {
                acc[key] = child;
            }
            return acc;
        }, {});
    const snapshotHash = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex');
    return { snapshot, snapshotHash };
};
