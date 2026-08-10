import {
    AiProjectContextEntryDetail,
    ProjectContextCitableEntry,
    ProjectContextEntry,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbProjectContextEntry,
    ProjectContextEntriesTable,
    ProjectContextEntriesTableName,
} from '../database/entities/projectContext';
import {
    parseProjectContextEntrySlug,
    PROJECT_CONTEXT_HASH_PREFIX_LENGTH,
} from './projectContextEntryIdentity';
import {
    planProjectContextReconcile,
    type ProjectContextExistingRow,
} from './projectContextReconcile';

/** Guards the forward walk from a tombstone to its live successor. */
const MAX_LINEAGE_DEPTH = 20;

// Absent stays absent, so a row round-trips to exactly the file shape the
// writeback path re-serializes.
const toEntry = (row: DbProjectContextEntry): ProjectContextCitableEntry => ({
    id: row.file_id,
    slug: row.slug,
    kind: row.kind,
    content: row.content,
    terms: row.terms,
    objects: row.objects,
    ...(row.title === null ? {} : { title: row.title }),
    ...(row.apply === null ? {} : { apply: row.apply }),
});

const toDetail = (
    row: DbProjectContextEntry,
    successorSlug: string | null,
): AiProjectContextEntryDetail => ({
    slug: row.slug,
    id: row.file_id,
    title: row.title,
    content: row.content,
    apply: row.apply,
    kind: row.kind,
    status: row.status,
    citedCount: row.cited_count,
    terms: row.terms,
    objects: row.objects,
    generatedAt: row.generated_at.toISOString(),
    successorSlug,
});

export class ProjectContextModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private table(trx?: Knex.Transaction) {
        return (trx ?? this.database)<ProjectContextEntriesTable>(
            ProjectContextEntriesTableName,
        );
    }

    /** Active entries in file order — the canonical read path. */
    async getActiveEntries(
        projectUuid: string,
    ): Promise<ProjectContextCitableEntry[]> {
        const rows = await this.table()
            .where('project_uuid', projectUuid)
            .where('status', 'active')
            .orderBy([
                { column: 'position', order: 'asc' },
                { column: 'created_at', order: 'asc' },
            ]);
        return rows.map(toEntry);
    }

    /**
     * The file view of the active entries, without row identity. Used by the
     * writeback paths, which merge against the file and re-serialize it.
     */
    async getDocument(projectUuid: string): Promise<ProjectContextEntry[]> {
        const entries = await this.getActiveEntries(projectUuid);
        return entries.map(({ slug, ...entry }) => entry);
    }

    /**
     * Reconcile the project's rows against a successfully parsed file. Lives in
     * the model so every writer — GitHub ingest and dbt compile alike — gets the
     * same semantics. Never deletes: entries that left the file are tombstoned.
     */
    async replaceEntriesForProject(
        projectUuid: string,
        entries: ProjectContextEntry[],
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const existing = await this.table(trx)
                .where('project_uuid', projectUuid)
                .select(
                    'hash',
                    'file_id',
                    'status',
                    'cited_count',
                    'last_cited_at',
                    'pulled_count',
                    'last_pulled_at',
                )
                .forUpdate();

            const existingRows: ProjectContextExistingRow[] = existing.map(
                (row) => ({
                    hash: row.hash,
                    fileId: row.file_id,
                    status: row.status,
                    citedCount: row.cited_count,
                    lastCitedAt: row.last_cited_at,
                    pulledCount: row.pulled_count,
                    lastPulledAt: row.last_pulled_at,
                }),
            );

            const { inserts, updates, tombstonedHashes } =
                planProjectContextReconcile({ existingRows, entries });

            if (tombstonedHashes.length > 0) {
                await this.table(trx)
                    .where('project_uuid', projectUuid)
                    .whereIn('hash', tombstonedHashes)
                    .update({
                        status: 'removed',
                        removed_at: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    });
            }

            for (const update of updates) {
                // Sequential on purpose: these rows are already locked by the
                // enclosing transaction.
                // eslint-disable-next-line no-await-in-loop
                await this.table(trx)
                    .where('project_uuid', projectUuid)
                    .where('hash', update.hash)
                    .update({
                        slug: update.slug,
                        file_id: update.fileId,
                        title: update.title,
                        apply: update.apply,
                        terms: JSON.stringify(update.terms),
                        objects: JSON.stringify(update.objects),
                        position: update.position,
                        status: 'active',
                        removed_at: null,
                        updated_at: trx.fn.now(),
                    });
            }

            if (inserts.length > 0) {
                await this.table(trx).insert(
                    inserts.map((insert) => ({
                        project_uuid: projectUuid,
                        hash: insert.hash,
                        slug: insert.slug,
                        file_id: insert.fileId,
                        kind: insert.kind,
                        content: insert.content,
                        title: insert.title,
                        apply: insert.apply,
                        terms: JSON.stringify(insert.terms),
                        objects: JSON.stringify(insert.objects),
                        status: 'active' as const,
                        position: insert.position,
                        predecessor_hash: insert.predecessorHash,
                        cited_count: insert.citedCount,
                        last_cited_at: insert.lastCitedAt,
                        pulled_count: insert.pulledCount,
                        last_pulled_at: insert.lastPulledAt,
                    })),
                );
            }
        });
    }

    /**
     * Resolve a citation slug to its entry, whatever its status. Matching is on
     * the hash prefix alone, so a renamed file id never breaks a persisted
     * citation; an exact slug match wins when a prefix is ambiguous.
     */
    async findEntryBySlug(args: {
        projectUuid: string;
        slug: string;
    }): Promise<AiProjectContextEntryDetail | undefined> {
        const rowsBySlug = await this.resolveSlugs(args.projectUuid, [
            args.slug,
        ]);
        const row = rowsBySlug.get(args.slug);
        if (!row) return undefined;

        const successorSlug =
            row.status === 'active'
                ? null
                : await this.findSuccessorSlug({
                      projectUuid: args.projectUuid,
                      hash: row.hash,
                  });
        return toDetail(row, successorSlug);
    }

    /**
     * Resolve citation slugs to rows. Matching is on the hash prefix alone, so
     * a renamed file id never breaks a persisted citation. When one prefix
     * matches several rows the exact slug wins; if none matches exactly the
     * citation is ambiguous and resolves to nothing rather than to an arbitrary
     * entry.
     */
    private async resolveSlugs(
        projectUuid: string,
        slugs: string[],
    ): Promise<Map<string, DbProjectContextEntry>> {
        const prefixBySlug = new Map(
            [...new Set(slugs)].flatMap((slug) => {
                const prefix = parseProjectContextEntrySlug(slug);
                return prefix ? [[slug, prefix] as const] : [];
            }),
        );
        if (prefixBySlug.size === 0) return new Map();

        const candidates = await this.table()
            .where('project_uuid', projectUuid)
            .whereRaw('left(hash, ?) = ANY(?)', [
                PROJECT_CONTEXT_HASH_PREFIX_LENGTH,
                [...new Set(prefixBySlug.values())],
            ]);

        const resolved = new Map<string, DbProjectContextEntry>();
        prefixBySlug.forEach((prefix, slug) => {
            const matches = candidates.filter(
                (candidate) =>
                    candidate.hash.slice(
                        0,
                        PROJECT_CONTEXT_HASH_PREFIX_LENGTH,
                    ) === prefix,
            );
            const row =
                matches.find((candidate) => candidate.slug === slug) ??
                (matches.length === 1 ? matches[0] : undefined);
            if (row) resolved.set(slug, row);
        });
        return resolved;
    }

    /** Walk the predecessor chain forward until it reaches a live entry. */
    private async findSuccessorSlug(args: {
        projectUuid: string;
        hash: string;
    }): Promise<string | null> {
        let hash: string | null = args.hash;
        const seen = new Set<string>();
        for (let depth = 0; depth < MAX_LINEAGE_DEPTH; depth += 1) {
            if (hash === null || seen.has(hash)) return null;
            seen.add(hash);
            const successor: DbProjectContextEntry | undefined =
                // eslint-disable-next-line no-await-in-loop
                await this.table()
                    .where('project_uuid', args.projectUuid)
                    .where('predecessor_hash', hash)
                    .orderBy('created_at', 'desc')
                    .first();
            if (!successor) return null;
            if (successor.status === 'active') return successor.slug;
            hash = successor.hash;
        }
        return null;
    }

    /**
     * Citation telemetry for project-context entries. Cited slugs resolve the
     * same way citations do, so an entry edited or removed after the answer was
     * written still counts.
     */
    async incrementCitedForEntries(args: {
        projectUuid: string;
        slugs: string[];
    }): Promise<Array<{ entryUuid: string; slug: string }>> {
        const rowsBySlug = await this.resolveSlugs(
            args.projectUuid,
            args.slugs,
        );
        const entryUuids = [
            ...new Set(
                [...rowsBySlug.values()].map(
                    (row) => row.project_context_entry_uuid,
                ),
            ),
        ];
        if (entryUuids.length === 0) return [];

        await this.table()
            .where('project_uuid', args.projectUuid)
            .whereIn('project_context_entry_uuid', entryUuids)
            .update({
                cited_count: this.database.raw('cited_count + 1'),
                last_cited_at: this.database.fn.now(),
            });

        return [...rowsBySlug.entries()].map(([slug, row]) => ({
            entryUuid: row.project_context_entry_uuid,
            slug,
        }));
    }

    /** Retrieval telemetry: the entries the agent actually loaded this turn. */
    async incrementPulledForEntries(args: {
        projectUuid: string;
        slugs: string[];
    }): Promise<void> {
        const slugs = [...new Set(args.slugs)];
        if (slugs.length === 0) return;

        await this.table()
            .where('project_uuid', args.projectUuid)
            .where('status', 'active')
            .whereIn('slug', slugs)
            .update({
                pulled_count: this.database.raw('pulled_count + 1'),
                last_pulled_at: this.database.fn.now(),
            });
    }
}
