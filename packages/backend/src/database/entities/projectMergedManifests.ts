import { type Knex } from 'knex';

export const ProjectMergedManifestsTableName = 'project_merged_manifests';
export const ProjectConnectionManifestsTableName =
    'project_connection_manifests';

export type DbProjectMergedManifest = {
    project_uuid: string;
    manifest: Buffer;
    created_at: Date;
};

export const ProjectMergedManifestsTable = (database: Knex) =>
    database<DbProjectMergedManifest>(ProjectMergedManifestsTableName);

export type DbProjectConnectionManifest = DbProjectMergedManifest & {
    connection_uuid: string;
};

export const ProjectConnectionManifestsTable = (database: Knex) =>
    database<DbProjectConnectionManifest>(ProjectConnectionManifestsTableName);
