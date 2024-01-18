import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import {
    GroupRole,
    InheritedProjectRole,
    OrganizationRole,
    ProjectMemberRole,
    ProjectRole,
    ProjectRoleOrder,
} from '../types/projectMemberRole';
import assertUnreachable from './assertUnreachable';

export const convertOrganizationRoleToProjectRole = (
    organizationRole: OrganizationMemberRole,
): ProjectMemberRole | undefined => {
    switch (organizationRole) {
        case OrganizationMemberRole.VIEWER:
            return ProjectMemberRole.VIEWER;
        case OrganizationMemberRole.INTERACTIVE_VIEWER:
            return ProjectMemberRole.INTERACTIVE_VIEWER;
        case OrganizationMemberRole.EDITOR:
            return ProjectMemberRole.EDITOR;
        case OrganizationMemberRole.DEVELOPER:
            return ProjectMemberRole.DEVELOPER;
        case OrganizationMemberRole.ADMIN:
            return ProjectMemberRole.ADMIN;
        case OrganizationMemberRole.MEMBER:
            return undefined;
        default:
            return assertUnreachable(
                organizationRole,
                `Unknown role ${organizationRole}`,
            );
    }
};

export const getHighestProjectRole = (
    inheritedRoles: Array<OrganizationRole | ProjectRole | GroupRole>,
): InheritedProjectRole | undefined =>
    inheritedRoles.reduce<InheritedProjectRole | undefined>(
        (highestRole, role) => {
            if (role.role === undefined) {
                return highestRole;
            }

            if (
                highestRole?.role === undefined ||
                ProjectRoleOrder[role.role] >=
                    ProjectRoleOrder[highestRole.role]
            ) {
                return {
                    type: role.type,
                    role: role.role,
                };
            }

            return highestRole;
        },
        undefined,
    );
