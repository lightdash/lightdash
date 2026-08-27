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

// Deep-sorts keys, drops undefined values, and serialises dates so that
// structurally equal documents always canonicalize and hash identically.
const canonicalize = (value: unknown): CanonicalJsonValue => {
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonicalize);
    if (typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce<Record<string, CanonicalJsonValue>>((acc, key) => {
                const child = (value as Record<string, unknown>)[key];
                if (child !== undefined) {
                    acc[key] = canonicalize(child);
                }
                return acc;
            }, {});
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
            if (declarative[key] !== undefined) {
                acc[key] = canonicalize(declarative[key]);
            }
            return acc;
        }, {});
    const snapshotHash = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex');
    return { snapshot, snapshotHash };
};
