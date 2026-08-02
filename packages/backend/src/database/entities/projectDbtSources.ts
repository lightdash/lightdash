import { DbtProjectType } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectDbtSourcesTableName = 'project_dbt_sources';

export type DbProjectDbtSource = {
    project_dbt_source_uuid: string;
    project_uuid: string;
    name: string;
    is_primary: boolean;
    precedence: number;
    dbt_connection_type: DbtProjectType | null;
    dbt_connection: Buffer | null;
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
>;

type UpdateDbProjectDbtSource = Partial<
    Pick<
        DbProjectDbtSource,
        | 'name'
        | 'precedence'
        | 'dbt_connection_type'
        | 'dbt_connection'
        | 'updated_at'
    >
>;

export type ProjectDbtSourcesTable = Knex.CompositeTableType<
    DbProjectDbtSource,
    CreateDbProjectDbtSource,
    UpdateDbProjectDbtSource
>;
