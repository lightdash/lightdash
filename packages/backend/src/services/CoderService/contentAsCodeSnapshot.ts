import {
    assertUnreachable,
    ContentAsCodeSkipReason,
    type ChartAsCode,
    type ContentAsCodeSkip,
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
// instance state; the snapshot records only the declarative document. The
// remaining keys are upload options and CLI bookkeeping that ride the same
// POST body as the document — the controller strips them, but hashing must
// stay correct for any direct API caller too, or fast_forward/in_sync
// verdicts become unreachable and every upload reads as drifted.
const STRIPPED_KEYS: ReadonlySet<string> = new Set([
    'updatedAt',
    'downloadedAt',
    'verification',
    'needsUpdating',
    'skipSpaceCreate',
    'publicSpaceCreate',
    'force',
    'spaceNames',
    'syncEnabled',
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

// How the instance content relates to the last-applied snapshot and the
// incoming as-code document.
export type ContentDriftVerdict =
    | 'in_sync' // instance matches last-applied: safe to apply incoming
    | 'fast_forward' // instance already matches incoming: just restamp
    | 'no_marker' // content exists but was never uploaded: treat as ahead
    | 'ahead'; // instance changed since last-applied: unsafe to overwrite

export const resolveDriftVerdict = (args: {
    currentHash: string;
    incomingHash: string;
    lastAppliedHash: string | null;
}): ContentDriftVerdict => {
    const { currentHash, incomingHash, lastAppliedHash } = args;
    if (currentHash === incomingHash) return 'fast_forward';
    if (lastAppliedHash === null) return 'no_marker';
    if (currentHash === lastAppliedHash) return 'in_sync';
    return 'ahead';
};

export type DriftGateOutcome =
    | { outcome: 'proceed' }
    | { outcome: 'fast_forward' }
    | { outcome: 'skip'; skip: ContentAsCodeSkip };

// Only evaluated for repos with content_as_code.sync enabled; without sync
// there is no snapshot baseline, so uploads apply unconditionally.
export const resolveDriftGate = (args: {
    verdict: ContentDriftVerdict;
    contentType: 'chart' | 'dashboard';
    slug: string;
    force?: boolean;
}): DriftGateOutcome => {
    const { verdict, contentType, slug, force } = args;
    switch (verdict) {
        case 'in_sync':
            return { outcome: 'proceed' };
        case 'fast_forward':
            // force means "upload even if unchanged", so it still applies
            return force ? { outcome: 'proceed' } : { outcome: 'fast_forward' };
        case 'ahead':
        case 'no_marker': {
            const label = contentType === 'chart' ? 'Chart' : 'Dashboard';
            const cause =
                verdict === 'ahead'
                    ? `changed in the Lightdash project since the last upload`
                    : `exists in the Lightdash project but has no record of a previous upload`;
            return {
                outcome: 'skip',
                skip: {
                    contentType,
                    slug,
                    reason: ContentAsCodeSkipReason.SKIPPED_AHEAD,
                    message: `${label} "${slug}" ${cause}; skipped to avoid overwriting those changes. Review the changes in Lightdash and propose them to git, or update the file to match the Lightdash project.`,
                },
            };
        }
        default:
            return assertUnreachable(verdict, 'Unknown drift verdict');
    }
};
