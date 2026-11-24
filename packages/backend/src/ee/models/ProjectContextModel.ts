import {
    loadProjectContextFile,
    PROJECT_CONTEXT_FILE_VERSION,
    ProjectContextEntry,
    serializeProjectContextFile,
    upsertProjectContextEntries,
} from '@lightdash/common';
import { Knex } from 'knex';
import { ProjectContextDocumentTableName } from '../database/entities/projectContext';

export class ProjectContextModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    // The whole cached document for the project (empty when unset).
    async getDocument(projectUuid: string): Promise<ProjectContextEntry[]> {
        const row = await this.database(ProjectContextDocumentTableName)
            .where('project_uuid', projectUuid)
            .first();
        return row ? (row.entries as ProjectContextEntry[]) : [];
    }

    // Replace-all: the file is the source of truth, so the cached blob is
    // overwritten wholesale on every ingest.
    async replaceEntriesForProject(
        projectUuid: string,
        entries: ProjectContextEntry[],
        database: Knex = this.database,
    ): Promise<void> {
        await database(ProjectContextDocumentTableName)
            .insert({
                project_uuid: projectUuid,
                version: PROJECT_CONTEXT_FILE_VERSION,
                // Stringify: pg serializes a top-level JS array as a Postgres
                // array literal, not JSON, which a jsonb column rejects.
                entries: JSON.stringify(entries),
                updated_at: database.fn.now(),
            })
            .onConflict('project_uuid')
            .merge(['version', 'entries', 'updated_at']);
    }

    /** Puts each entry in place of the one with its id, or adds it; one writer at a time per project, so concurrent publishes keep each other's entries unless they share an id, where the last one wins. Throws a ParseError, writing nothing, when the merged file fails its schema. */
    async upsertEntries(
        projectUuid: string,
        entries: ProjectContextEntry[],
        /** A transaction to join, so the write commits or rolls back with it. */
        database: Knex = this.database,
    ): Promise<ProjectContextEntry[]> {
        return database.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `project-context:${projectUuid}`,
            ]);
            const row = await trx(ProjectContextDocumentTableName)
                .where('project_uuid', projectUuid)
                .first();
            const merged = upsertProjectContextEntries(
                row ? (row.entries as ProjectContextEntry[]) : [],
                entries,
            );
            loadProjectContextFile(serializeProjectContextFile(merged));
            await this.replaceEntriesForProject(projectUuid, merged, trx);
            return merged;
        });
    }
}
