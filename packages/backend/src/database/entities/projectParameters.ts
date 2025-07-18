import { LightdashProjectParameter } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectParametersTableName = 'project_parameters';

export type DbProjectParameter = {
    project_uuid: string;
    name: string;
    config: LightdashProjectParameter;
    created_at: Date;
};

export type CreateDbProjectParameter = Pick<
    DbProjectParameter,
    'project_uuid' | 'name' | 'config'
>;

export type UpdateDbProjectParameter = Partial<
    Pick<DbProjectParameter, 'config'>
>;

export type ProjectParametersTable = Knex.CompositeTableType<
    DbProjectParameter,
    CreateDbProjectParameter,
    UpdateDbProjectParameter
>;
