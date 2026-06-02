import {
    PROJECT_CONTEXT_FILE_VERSION,
    ProjectContextEntry,
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
    ): Promise<void> {
        await this.database(ProjectContextDocumentTableName)
            .insert({
                project_uuid: projectUuid,
                version: PROJECT_CONTEXT_FILE_VERSION,
                entries,
                updated_at: this.database.fn.now(),
            })
            .onConflict('project_uuid')
            .merge(['version', 'entries', 'updated_at']);
    }
}
