import {
    assertUnreachable,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';

const inheritedProjectRoleFromOrgRole = (
    orgRole: OrganizationMemberRole,
): ProjectMemberRole | null => {
    switch (orgRole) {
        case OrganizationMemberRole.MEMBER:
            return null;
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
): ProjectMemberRole | null =>
    // if user has not project role, it inherits rol from org
    projectRole || inheritedProjectRoleFromOrgRole(organizationRole);
