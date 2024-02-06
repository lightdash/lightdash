import {
    assertUnreachable,
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
    SpaceRoleInfo,
} from '@lightdash/common';

const inheritedSpaceRoleFromOrgRole = (
    orgRole: OrganizationMemberRole,
): SpaceMemberRole | null => {
    switch (orgRole) {
        case OrganizationMemberRole.MEMBER:
            return null;
        case OrganizationMemberRole.VIEWER:
            return SpaceMemberRole.VIEWER;
        case OrganizationMemberRole.INTERACTIVE_VIEWER:
            return SpaceMemberRole.VIEWER;
        case OrganizationMemberRole.EDITOR:
            return SpaceMemberRole.EDITOR;
        case OrganizationMemberRole.DEVELOPER:
            return SpaceMemberRole.EDITOR;
        case OrganizationMemberRole.ADMIN:
            return SpaceMemberRole.EDITOR;
        default:
            return assertUnreachable(
                orgRole,
                `Organization role ${orgRole} does not match Space roles`,
            );
    }
};

const inheritedSpaceRoleFromProjectRole = (
    projRole: ProjectMemberRole,
): SpaceMemberRole => {
    switch (projRole) {
        case ProjectMemberRole.VIEWER:
            return SpaceMemberRole.VIEWER;
        case ProjectMemberRole.INTERACTIVE_VIEWER:
            return SpaceMemberRole.VIEWER;
        case ProjectMemberRole.EDITOR:
            return SpaceMemberRole.EDITOR;
        case ProjectMemberRole.DEVELOPER:
            return SpaceMemberRole.EDITOR;
        case ProjectMemberRole.ADMIN:
            return SpaceMemberRole.EDITOR;
        default:
            return assertUnreachable(
                projRole,
                `Project role ${projRole} does not match Space roles`,
            );
    }
};

export const getSpaceRoleInfo = (
    projectRole: ProjectMemberRole | null | undefined,
    organizationRole: OrganizationMemberRole,
): SpaceRoleInfo | null => {
    if (projectRole) {
        return {
            role: inheritedSpaceRoleFromProjectRole(projectRole),
            hasDirectAccess: false,
            inheritedRole: projectRole,
            inheritedFrom: 'project',
        };
    }

    if (organizationRole) {
        const inheritedRole = inheritedSpaceRoleFromOrgRole(organizationRole);
        return inheritedRole
            ? {
                  role: inheritedRole,
                  hasDirectAccess: false,
                  inheritedRole: organizationRole,
                  inheritedFrom: 'organization',
              }
            : null;
    }

    return null;
};
