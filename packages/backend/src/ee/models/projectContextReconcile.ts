import type { ProjectContextEntry } from '@lightdash/common';
import {
    buildProjectContextEntrySlug,
    hashProjectContextEntry,
} from './projectContextEntryIdentity';

/** Telemetry a row carries across a content edit, via file-id lineage. */
export type ProjectContextEntryTelemetry = {
    citedCount: number;
    lastCitedAt: Date | null;
    pulledCount: number;
    lastPulledAt: Date | null;
};

/** The parts of an existing row the reconcile needs to decide what to do. */
export type ProjectContextExistingRow = ProjectContextEntryTelemetry & {
    hash: string;
    fileId: string;
    status: 'active' | 'removed';
};

export type ProjectContextEntryInsert = ProjectContextEntryTelemetry & {
    hash: string;
    slug: string;
    fileId: string;
    kind: ProjectContextEntry['kind'];
    content: string;
    title: string | null;
    apply: string | null;
    terms: string[];
    objects: ProjectContextEntry['objects'];
    position: number;
    predecessorHash: string | null;
};

/** Retrieval metadata refresh for a row whose content (and so hash) is unchanged. */
export type ProjectContextEntryUpdate = {
    hash: string;
    slug: string;
    fileId: string;
    title: string | null;
    apply: string | null;
    terms: string[];
    objects: ProjectContextEntry['objects'];
    position: number;
};

export type ProjectContextReconcilePlan = {
    inserts: ProjectContextEntryInsert[];
    updates: ProjectContextEntryUpdate[];
    /** Hashes of rows no longer in the file. Tombstoned, never deleted. */
    tombstonedHashes: string[];
};

/**
 * Diff a parsed file against the rows currently stored for a project.
 *
 * Same hash → the row stays, its retrieval metadata is refreshed and a
 * tombstone is lifted. Gone from the file → tombstoned, so the exact content
 * the agent read stays resolvable forever. A new hash whose file id matches a
 * row tombstoned in this same pass is treated as an edit of that entry: it
 * inherits the counters and links back through `predecessorHash`.
 */
export const planProjectContextReconcile = ({
    existingRows,
    entries,
}: {
    existingRows: ProjectContextExistingRow[];
    entries: ProjectContextEntry[];
}): ProjectContextReconcilePlan => {
    // First occurrence wins: two file entries with identical content and kind
    // are one row.
    const desired = new Map<
        string,
        { entry: ProjectContextEntry; position: number }
    >();
    entries.forEach((entry, position) => {
        const hash = hashProjectContextEntry(entry);
        if (!desired.has(hash)) {
            desired.set(hash, { entry, position });
        }
    });

    const existingByHash = new Map(
        existingRows.map((row) => [row.hash, row] as const),
    );

    const tombstonedHashes = existingRows
        .filter((row) => row.status === 'active' && !desired.has(row.hash))
        .map((row) => row.hash);
    const tombstonedByFileId = new Map<string, ProjectContextExistingRow>();
    tombstonedHashes.forEach((hash) => {
        const row = existingByHash.get(hash)!;
        if (!tombstonedByFileId.has(row.fileId)) {
            tombstonedByFileId.set(row.fileId, row);
        }
    });

    const inserts: ProjectContextEntryInsert[] = [];
    const updates: ProjectContextEntryUpdate[] = [];

    desired.forEach(({ entry, position }, hash) => {
        const slug = buildProjectContextEntrySlug(entry.id, hash);
        const shared = {
            hash,
            slug,
            fileId: entry.id,
            title: entry.title ?? null,
            apply: entry.apply ?? null,
            terms: entry.terms,
            objects: entry.objects,
            position,
        };

        if (existingByHash.has(hash)) {
            updates.push(shared);
            return;
        }

        const predecessor = tombstonedByFileId.get(entry.id) ?? null;
        inserts.push({
            ...shared,
            kind: entry.kind,
            content: entry.content,
            predecessorHash: predecessor?.hash ?? null,
            citedCount: predecessor?.citedCount ?? 0,
            lastCitedAt: predecessor?.lastCitedAt ?? null,
            pulledCount: predecessor?.pulledCount ?? 0,
            lastPulledAt: predecessor?.lastPulledAt ?? null,
        });
    });

    return { inserts, updates, tombstonedHashes };
};
