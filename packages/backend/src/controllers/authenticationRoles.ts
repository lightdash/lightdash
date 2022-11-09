import {
    assertUnreachable,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';

const inheritedProjectRoleFromOrgRole = (
    orgRole: OrganizationMemberRole,
): ProjectMemberRole => {
    switch (orgRole) {
        case OrganizationMemberRole.MEMBER:
        case OrganizationMemberRole.VIEWER:
            return ProjectMemberRole.VIEWER;
        case OrganizationMemberRole.EDITOR:
            return ProjectMemberRole.EDITOR;
        case OrganizationMemberRole.ADMIN:
            return ProjectMemberRole.ADMIN;
        default:
            return assertUnreachable(
                orgRole,
                `Organization role ${orgRole} does not match Project roles`,
            );
    }
};

export const getProjectRoleOrInheritedFromOrganization = (
    projectRole: ProjectMemberRole | null | undefined,
    organizationRole: OrganizationMemberRole,
): ProjectMemberRole =>
    // if user has not project role, it inherits rol from org
    projectRole || inheritedProjectRoleFromOrgRole(organizationRole);
