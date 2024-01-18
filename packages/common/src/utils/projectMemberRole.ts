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
): ProjectMemberRole => {
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
            return ProjectMemberRole.VIEWER;
        default:
            return assertUnreachable(
                organizationRole,
                `Unknown role ${organizationRole}`,
            );
    }
};

export const getHighestProjectRole = (
    inheritedRoles: Array<OrganizationRole | ProjectRole | GroupRole>,
): InheritedProjectRole =>
    inheritedRoles.reduce<InheritedProjectRole>(
        (highestRole, role) => {
            if (role.role === undefined) {
                return highestRole;
            }

            if (
                highestRole.role === undefined ||
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
        { type: 'project', role: ProjectMemberRole.VIEWER },
    );
