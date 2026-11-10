import { type DbtExternalModelNode } from '@lightdash/common';
import { type Knex } from 'knex';

export const DbtSourceRefCatalogsTableName = 'dbt_source_ref_catalogs';
export type DbDbtSourceRefCatalog = {
    dbt_source_ref_catalog_uuid: string;
    project_uuid: string;
    dbt_source_uuid: string;
    connection_group: string;
    project_name: string;
    dbt_version: string;
    status: 'provisional' | 'confirmed';
    nodes: DbtExternalModelNode[];
    referenced_projects: string[];
    nodes_digest: string;
    compile_job_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};
export type DbtSourceRefCatalogsTable = Knex.CompositeTableType<
    DbDbtSourceRefCatalog,
    Omit<
        DbDbtSourceRefCatalog,
        | 'dbt_source_ref_catalog_uuid'
        | 'created_at'
        | 'updated_at'
        | 'nodes'
        | 'referenced_projects'
    > & { nodes: string; referenced_projects?: string },
    Partial<Omit<DbDbtSourceRefCatalog, 'nodes' | 'referenced_projects'>> & {
        nodes?: string;
        referenced_projects?: string;
    }
>;
