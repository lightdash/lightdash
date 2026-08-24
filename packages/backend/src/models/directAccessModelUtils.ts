import {
    OrganizationMemberRole,
    type SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import { UserTableName } from '../database/entities/users';

export type DirectAccess = {
    organizationUuid: string;
    projectUuid: string;
    userRole: SpaceMemberRole | null;
    groupRoles: SpaceMemberRole[];
};

export type DirectAccessRow = {
    resourceUuid: string;
    organizationUuid: string;
    projectUuid: string;
    role: SpaceMemberRole;
    groupUuid: string | null;
};

export const groupDirectAccessRows = (
    rows: DirectAccessRow[],
): Record<string, DirectAccess> => {
    const accessByResource: Record<string, DirectAccess> = {};
    for (const row of rows) {
        const access = accessByResource[row.resourceUuid] ?? {
            organizationUuid: row.organizationUuid,
            projectUuid: row.projectUuid,
            userRole: null,
            groupRoles: [],
        };
        if (row.groupUuid === null) {
            access.userRole = row.role;
        } else {
            access.groupRoles.push(row.role);
        }
        accessByResource[row.resourceUuid] = access;
    }
    return accessByResource;
};

/**
 * Direct grants cannot create project membership. This predicate keeps stored
 * grants inert unless the principal still has a current project access path.
 */
export const getActiveProjectMemberPredicate = (trx: Knex): Knex.Raw =>
    trx.raw(
        `
            ?? = TRUE AND (
                ??.role != ?
                OR ??.role_uuid IS NOT NULL
                OR EXISTS (
                    SELECT 1
                    FROM ?? AS organization_extra_role
                    WHERE organization_extra_role.user_id = ??.user_id
                      AND organization_extra_role.organization_id = ??.organization_id
                )
                OR EXISTS (
                    SELECT 1
                    FROM ?? AS direct_project_membership
                    WHERE direct_project_membership.user_id = ??.user_id
                      AND direct_project_membership.project_id = ??.project_id
                )
                OR EXISTS (
                    SELECT 1
                    FROM ?? AS project_group_membership
                    INNER JOIN ?? AS current_project_group_membership
                        ON current_project_group_membership.group_uuid = project_group_membership.group_uuid
                    WHERE project_group_membership.project_uuid = ??.project_uuid
                      AND current_project_group_membership.user_id = ??.user_id
                      AND current_project_group_membership.organization_id = ??.organization_id
                )
            )
        `,
        [
            `${UserTableName}.is_active`,
            OrganizationMembershipsTableName,
            OrganizationMemberRole.MEMBER,
            OrganizationMembershipsTableName,
            OrganizationMembershipCustomRolesTableName,
            UserTableName,
            ProjectTableName,
            ProjectMembershipsTableName,
            UserTableName,
            ProjectTableName,
            ProjectGroupAccessTableName,
            GroupMembershipTableName,
            ProjectTableName,
            UserTableName,
            ProjectTableName,
        ],
    );

/**
 * A group grant is inert unless the granted group itself still holds current
 * access to the resource's project. Without this predicate, a grant made to a
 * project group would keep working after the group is removed from the
 * project, for any member who retains a separate project access path.
 */
export const getActiveGrantedGroupPredicate = (
    trx: Knex,
    groupAccessTable: string,
): Knex.Raw =>
    trx.raw(
        `
            EXISTS (
                SELECT 1
                FROM ?? AS granted_group_project_access
                WHERE granted_group_project_access.group_uuid = ??.group_uuid
                  AND granted_group_project_access.project_uuid = ??.project_uuid
            )
        `,
        [ProjectGroupAccessTableName, groupAccessTable, ProjectTableName],
    );
