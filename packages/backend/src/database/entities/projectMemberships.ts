import { ProjectMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectMembershipsTableName = 'project_memberships';

export type DbProjectMembership = {
    project_id: number;
    user_id: number;
    created_at: Date;
    role: ProjectMemberRole | null;
    role_uuid?: string | null;
};

export type DbProjectMembershipIn = {
    user_id: number;
    project_id: number;
    role: ProjectMemberRole | null;
    role_uuid?: string | null;
};

export type DbProjectMembershipUpdate = {
    role?: ProjectMemberRole;
    role_uuid?: string | null;
};

export type ProjectMembershipsTable = Knex.CompositeTableType<
    DbProjectMembership,
    DbProjectMembershipIn,
    DbProjectMembershipUpdate
>;
