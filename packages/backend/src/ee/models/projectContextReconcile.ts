import {
    normalizeProjectContextEntryContent,
    type AiProjectContextEntryStatus,
    type ProjectContextEntry,
} from '@lightdash/common';
import { createHash } from 'crypto';

/**
 * Identity hash: sha256 over normalized content + kind. Terms/objects/title
 * are retrieval metadata, updated in place, never identity.
 */
export const computeProjectContextEntryHash = (
    entry: Pick<ProjectContextEntry, 'content' | 'kind'>,
): string =>
    createHash('sha256')
        .update(
            `${normalizeProjectContextEntryContent(entry.content)}${
                entry.kind
            }`,
        )
        .digest('hex');

/** The subset of a persisted row the reconcile diff needs. */
export type ProjectContextEntryRowState = {
    hash: string;
    status: AiProjectContextEntryStatus;
    entry_id: string;
    content: string;
    title: string | null;
    apply: string | null;
    terms: string[];
    objects: ProjectContextEntry['objects'];
};

export type ProjectContextEntryWithHash = ProjectContextEntry & {
    hash: string;
};

export type ProjectContextReconcilePlan = {
    inserts: ProjectContextEntryWithHash[];
    /** Same hash as an existing row: refresh metadata in place, un-tombstone. */
    updates: ProjectContextEntryWithHash[];
    tombstoneHashes: string[];
};

const sameMetadata = (
    row: ProjectContextEntryRowState,
    entry: ProjectContextEntry,
): boolean =>
    row.status === 'active' &&
    row.entry_id === entry.id &&
    row.content === entry.content &&
    row.title === (entry.title ?? null) &&
    row.apply === (entry.apply ?? null) &&
    JSON.stringify(row.terms) === JSON.stringify(entry.terms) &&
    JSON.stringify(row.objects) === JSON.stringify(entry.objects);

/**
 * Pure state-transition diff between the persisted rows and a successfully
 * parsed file. Same hash updates metadata in place (telemetry preserved,
 * tombstones revived); hashes gone from the file are tombstoned, never
 * deleted; duplicate hashes within the file collapse to the first entry. An
 * empty file tombstones everything; an unchanged file yields an empty plan.
 */
export const computeProjectContextReconcilePlan = ({
    existing,
    incoming,
}: {
    existing: ProjectContextEntryRowState[];
    incoming: ProjectContextEntry[];
}): ProjectContextReconcilePlan => {
    const existingByHash = new Map(existing.map((row) => [row.hash, row]));

    const inserts: ProjectContextEntryWithHash[] = [];
    const updates: ProjectContextEntryWithHash[] = [];
    const incomingHashes = new Set<string>();

    for (const entry of incoming) {
        const hash = computeProjectContextEntryHash(entry);
        if (!incomingHashes.has(hash)) {
            incomingHashes.add(hash);
            const row = existingByHash.get(hash);
            if (!row) {
                inserts.push({ ...entry, hash });
            } else if (!sameMetadata(row, entry)) {
                updates.push({ ...entry, hash });
            }
        }
    }

    const tombstoneHashes = existing
        .filter(
            (row) => row.status === 'active' && !incomingHashes.has(row.hash),
        )
        .map((row) => row.hash);

    return { inserts, updates, tombstoneHashes };
};
