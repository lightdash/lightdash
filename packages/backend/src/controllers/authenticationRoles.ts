import {
    inheritedProjectRoleFromOrgRole,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';

export const getProjectRoleOrInheritedFromOrganization = (
    projectRole: ProjectMemberRole | null | undefined,
    organizationRole: OrganizationMemberRole,
): ProjectMemberRole =>
    // if user has not project role, it inherits rol from org
    projectRole || inheritedProjectRoleFromOrgRole(organizationRole);
