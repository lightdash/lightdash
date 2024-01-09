import { ProjectMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectGroupAccessTableName = 'project_group_access';

export type DBProjectGroupAccess = {
    project_id: number;
    group_uuid: string;
    organization_id: number;
    role: ProjectMemberRole;
};

export type CreateDBProjectGroupAccess = Pick<
    DBProjectGroupAccess,
    'project_id' | 'group_uuid' | 'organization_id' | 'role'
>;

export type UpdateDBProjectGroupAccess = Pick<DBProjectGroupAccess, 'role'>;

export type ProjectGroupAccessTable = Knex.CompositeTableType<
    DBProjectGroupAccess,
    CreateDBProjectGroupAccess,
    UpdateDBProjectGroupAccess
>;
