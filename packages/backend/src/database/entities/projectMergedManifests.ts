import { type Knex } from 'knex';

export const ProjectMergedManifestsTableName = 'project_merged_manifests';

export type DbProjectMergedManifest = {
    project_uuid: string;
    manifest: Buffer;
    created_at: Date;
};

export const ProjectMergedManifestsTable = (
    database: Knex,
): Knex.QueryBuilder<DbProjectMergedManifest> =>
    database<DbProjectMergedManifest>(ProjectMergedManifestsTableName);
