import {
    buildProjectContextEntrySlug,
    parseProjectContextEntrySlugHash8,
    PROJECT_CONTEXT_FILE_VERSION,
    type AiProjectContextEntry,
    type ProjectContextEntry,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ProjectContextDocumentTableName,
    ProjectContextEntriesTableName,
    type DbProjectContextEntry,
} from '../database/entities/projectContext';
import {
    computeProjectContextReconcilePlan,
    type ProjectContextEntryWithHash,
} from './projectContextReconcile';

export type ProjectContextDocumentEntry = ProjectContextEntry & {
    slug: string;
};

const toDocumentEntry = (
    row: DbProjectContextEntry,
): ProjectContextDocumentEntry => ({
    id: row.entry_id,
    kind: row.kind,
    content: row.content,
    terms: row.terms,
    objects: row.objects,
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.apply !== null ? { apply: row.apply } : {}),
    slug: buildProjectContextEntrySlug(row.entry_id, row.hash),
});

const toApiEntry = (row: DbProjectContextEntry): AiProjectContextEntry => ({
    slug: buildProjectContextEntrySlug(row.entry_id, row.hash),
    entryId: row.entry_id,
    kind: row.kind,
    title: row.title,
    apply: row.apply,
    content: row.content,
    terms: row.terms,
    objects: row.objects,
    status: row.status,
    citedCount: row.cited_count,
    generatedAt: row.created_at.toISOString(),
});

const metadataColumns = (entry: ProjectContextEntryWithHash) => ({
    entry_id: entry.id,
    kind: entry.kind,
    content: entry.content,
    title: entry.title ?? null,
    apply: entry.apply ?? null,
    // Stringify: pg serializes a top-level JS array as a Postgres array
    // literal, not JSON, which a jsonb column rejects.
    terms: JSON.stringify(entry.terms),
    objects: JSON.stringify(entry.objects),
});

export class ProjectContextModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    // The active entries for the project (empty when unset), each with its
    // citation slug so the agent tool has something to cite.
    async getDocument(
        projectUuid: string,
    ): Promise<ProjectContextDocumentEntry[]> {
        const rows = await this.database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('status', 'active')
            .orderBy([
                { column: 'created_at', order: 'asc' },
                { column: 'entry_id', order: 'asc' },
            ]);
        return rows.map(toDocumentEntry);
    }

    /**
     * Reconcile the rows against a successfully parsed file. Same hash keeps
     * the row (telemetry preserved, metadata refreshed, tombstones revived);
     * hashes gone from the file are tombstoned, never deleted. An empty
     * entries array (present-but-empty file) tombstones everything. Callers
     * must not invoke this for a missing/unparseable file.
     */
    async reconcileEntriesForProject(
        projectUuid: string,
        entries: ProjectContextEntry[],
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // Serialize reconciles per project: row locks can't order two
            // ingests whose hash sets are disjoint (nothing to lock), which
            // would leave entries from two file revisions active at once.
            await trx.raw(
                'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
                [`project_context_entries:${projectUuid}`],
            );
            const existing = await trx(ProjectContextEntriesTableName).where(
                'project_uuid',
                projectUuid,
            );

            const plan = computeProjectContextReconcilePlan({
                existing,
                incoming: entries,
            });

            if (plan.inserts.length > 0) {
                // Upsert as a backstop against rows written outside the
                // advisory lock (e.g. the migration backfill).
                await trx(ProjectContextEntriesTableName)
                    .insert(
                        plan.inserts.map((entry) => ({
                            project_uuid: projectUuid,
                            hash: entry.hash,
                            status: 'active' as const,
                            updated_at: trx.fn.now(),
                            ...metadataColumns(entry),
                        })),
                    )
                    .onConflict(['project_uuid', 'hash'])
                    .merge([
                        'entry_id',
                        'kind',
                        'content',
                        'title',
                        'apply',
                        'terms',
                        'objects',
                        'status',
                        'updated_at',
                    ]);
            }

            for (const entry of plan.updates) {
                // eslint-disable-next-line no-await-in-loop
                await trx(ProjectContextEntriesTableName)
                    .where('project_uuid', projectUuid)
                    .andWhere('hash', entry.hash)
                    .update({
                        status: 'active',
                        updated_at: trx.fn.now(),
                        ...metadataColumns(entry),
                    });
            }

            if (plan.tombstoneHashes.length > 0) {
                await trx(ProjectContextEntriesTableName)
                    .where('project_uuid', projectUuid)
                    .whereIn('hash', plan.tombstoneHashes)
                    .update({
                        status: 'removed',
                        updated_at: trx.fn.now(),
                    });
            }

            // Dual-write the legacy blob so pre-entries code (rolling deploy,
            // rollback) keeps reading fresh context. Remove with the table.
            await trx(ProjectContextDocumentTableName)
                .insert({
                    project_uuid: projectUuid,
                    version: PROJECT_CONTEXT_FILE_VERSION,
                    // Stringify: pg serializes a top-level JS array as a
                    // Postgres array literal, which a jsonb column rejects.
                    entries: JSON.stringify(entries),
                    updated_at: trx.fn.now(),
                })
                .onConflict('project_uuid')
                .merge(['version', 'entries', 'updated_at']);
        });
    }

    /**
     * Resolve a citation slug to the entry the agent read, any status. Matches
     * on the trailing hash8 only (the id prefix is cosmetic and may churn);
     * an ambiguous or unparseable slug resolves to nothing.
     */
    async findEntryBySlug(
        projectUuid: string,
        slug: string,
    ): Promise<AiProjectContextEntry | undefined> {
        const hash8 = parseProjectContextEntrySlugHash8(slug);
        if (!hash8) {
            return undefined;
        }
        const rows = await this.database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .whereRaw('left(hash, 8) = ?', [hash8]);
        if (rows.length !== 1) {
            return undefined;
        }
        return toApiEntry(rows[0]);
    }

    // Telemetry mirror of memory citations: counts once per entry per answer.
    // Returns the number of rows updated so callers can report dropped slugs.
    async incrementCitedBySlugs(
        projectUuid: string,
        slugs: string[],
    ): Promise<number> {
        const hash8s = [
            ...new Set(
                slugs
                    .map(parseProjectContextEntrySlugHash8)
                    .filter((hash8): hash8 is string => hash8 !== null),
            ),
        ];
        if (hash8s.length === 0) {
            return 0;
        }
        return this.database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('status', 'active')
            .whereRaw('left(hash, 8) = ANY(?)', [hash8s])
            .update({
                cited_count: this.database.raw('cited_count + 1'),
                last_cited_at: this.database.fn.now(),
            });
    }

    // Telemetry mirror of memory pulls: counts each time the agent tool loads
    // the entry into a turn.
    async incrementPulledBySlugs(
        projectUuid: string,
        slugs: string[],
    ): Promise<void> {
        const hash8s = [
            ...new Set(
                slugs
                    .map(parseProjectContextEntrySlugHash8)
                    .filter((hash8): hash8 is string => hash8 !== null),
            ),
        ];
        if (hash8s.length === 0) {
            return;
        }
        await this.database(ProjectContextEntriesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('status', 'active')
            .whereRaw('left(hash, 8) = ANY(?)', [hash8s])
            .update({
                pulled_count: this.database.raw('pulled_count + 1'),
                last_pulled_at: this.database.fn.now(),
            });
    }
}
