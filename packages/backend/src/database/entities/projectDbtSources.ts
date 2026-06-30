import { DbtProjectType } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectDbtSourcesTableName = 'project_dbt_sources';

/**
 * Where a source's latest compiled manifest is stored. 'inline' keeps it in the
 * encrypted dbt_connection (legacy MANIFEST behaviour); 's3' stores it as a
 * single object referenced by manifest_s3_key (revived from #24323).
 */
export type DbtManifestSourceType = 'inline' | 's3';

export type DbProjectDbtSource = {
    project_dbt_source_uuid: string;
    project_uuid: string;
    name: string;
    is_primary: boolean;
    precedence: number;
    dbt_connection_type: DbtProjectType | null;
    dbt_connection: Buffer | null;
    manifest_source_type: DbtManifestSourceType;
    manifest_s3_key: string | null;
    manifest_updated_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

type CreateDbProjectDbtSource = Pick<
    DbProjectDbtSource,
    | 'project_uuid'
    | 'name'
    | 'is_primary'
    | 'precedence'
    | 'dbt_connection_type'
    | 'dbt_connection'
    | 'manifest_source_type'
    | 'manifest_s3_key'
>;

type UpdateDbProjectDbtSource = Partial<
    Pick<
        DbProjectDbtSource,
        | 'name'
        | 'precedence'
        | 'dbt_connection_type'
        | 'dbt_connection'
        | 'manifest_source_type'
        | 'manifest_s3_key'
        | 'manifest_updated_at'
    >
>;

export type ProjectDbtSourcesTable = Knex.CompositeTableType<
    DbProjectDbtSource,
    CreateDbProjectDbtSource,
    UpdateDbProjectDbtSource
>;
