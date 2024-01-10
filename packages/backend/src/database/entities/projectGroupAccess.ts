import { ProjectMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectGroupAccessTableName = 'project_group_access';

export type DBProjectGroupAccess = {
    project_uuid: string;
    group_uuid: string;
    role: ProjectMemberRole;
};

export type CreateDBProjectGroupAccess = Pick<
    DBProjectGroupAccess,
    'project_uuid' | 'group_uuid' | 'role'
>;

export type UpdateDBProjectGroupAccess = Pick<DBProjectGroupAccess, 'role'>;

export type ProjectGroupAccessTable = Knex.CompositeTableType<
    DBProjectGroupAccess,
    CreateDBProjectGroupAccess,
    UpdateDBProjectGroupAccess
>;
