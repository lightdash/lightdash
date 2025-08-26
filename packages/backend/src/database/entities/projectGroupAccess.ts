import { ProjectMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectGroupAccessTableName = 'project_group_access';

export type DBProjectGroupAccess = {
    project_id: number;
    project_uuid: string;
    group_uuid: string;
    role: ProjectMemberRole;
    role_uuid?: string | null;
};

export type CreateDBProjectGroupAccess = {
    project_id?: number;
    project_uuid: string;
    group_uuid: string;
    role: ProjectMemberRole;
    role_uuid?: string | null;
};

export type UpdateDBProjectGroupAccess = {
    role: ProjectMemberRole;
    role_uuid?: string | null;
};

export type ProjectGroupAccessTable = Knex.CompositeTableType<
    DBProjectGroupAccess,
    CreateDBProjectGroupAccess,
    UpdateDBProjectGroupAccess
>;
