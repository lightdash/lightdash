import {
    convertProjectRoleToSpaceRole,
    defineUserAbility,
    getHighestSpaceRole,
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
    type SpaceAccess,
} from '@lightdash/common';

type TestUserParams = {
    spaceUuid?: string;
    userUuid?: string;
    organizationUuid?: string;
    organizationRole?: OrganizationMemberRole;
    projectUuid?: string;
    projectRole?: ProjectMemberRole;
    projectGroupRoles?: ProjectMemberRole[];
};

type TestSpaceParams = {
    spaceUuid?: string;
    organizationUuid?: string;
    projectUuid?: string;
    isPrivate?: boolean;
};

type TestAccessParams = {
    spaceRole?: SpaceMemberRole | null;
    groupSpaceRole?: SpaceMemberRole | null;
    groupSpaceRoles?: SpaceMemberRole[];
    isPrivate?: boolean;
    spaceUuid?: string;
    userUuid?: string;
    organizationRole?: OrganizationMemberRole;
    projectRole?: ProjectMemberRole;
    projectGroupRoles?: ProjectMemberRole[];
};

export const createTestUser = ({
    userUuid = 'test-user-uuid',
    organizationUuid = 'test-org-uuid',
    organizationRole = OrganizationMemberRole.MEMBER,
    projectUuid = 'test-project-uuid',
    projectRole,
    projectGroupRoles = [],
}: TestUserParams = {}) => ({
    userUuid,
    ability: defineUserAbility(
        {
            userUuid,
            role: organizationRole,
            organizationUuid,
        },
        [
            ...(projectGroupRoles?.map((role) => ({
                projectUuid,
                role,
                userUuid,
                roleUuid: undefined,
            })) || []),
            ...(projectRole
                ? [
                      {
                          projectUuid,
                          role: projectRole,
                          userUuid,
                          roleUuid: undefined,
                      },
                  ]
                : []),
        ],
    ),
});

export const createTestSpace = ({
    spaceUuid = 'test-space-uuid',
    organizationUuid = 'test-org-uuid',
    projectUuid = 'test-project-uuid',
    isPrivate = true,
}: TestSpaceParams = {}) => ({
    uuid: spaceUuid,
    organizationUuid,
    projectUuid,
    isPrivate,
});

export const createSpaceAccessContext = ({
    userUuid = 'test-user-uuid',
    organizationUuid = 'test-org-uuid',
    projectUuid = 'test-project-uuid',
    isPrivate = true,
    organizationRole = OrganizationMemberRole.MEMBER,
    projectRole,
    spaceRole = null,
    groupSpaceRole = null,
    groupSpaceRoles,
    projectGroupRoles = [],
}: TestAccessParams & {
    organizationUuid?: string;
    projectUuid?: string;
}): {
    organizationUuid: string;
    projectUuid: string;
    isPrivate: boolean;
    access: SpaceAccess[];
} => {
    // Compute effective space role (mirrors resolveSpaceAccess logic)
    const allSpaceRoles = [
        spaceRole,
        groupSpaceRole,
        ...(groupSpaceRoles ?? []),
    ].filter((r): r is SpaceMemberRole => r !== null && r !== undefined);

    const hasDirectAccess = allSpaceRoles.length > 0;

    // Project admin always gets space admin
    const isProjectAdmin = projectRole === ProjectMemberRole.ADMIN;
    const isProjectAdminViaGroup = projectGroupRoles.includes(
        ProjectMemberRole.ADMIN,
    );

    let effectiveRole: SpaceMemberRole | undefined;
    if (isProjectAdmin || isProjectAdminViaGroup) {
        effectiveRole = SpaceMemberRole.ADMIN;
    } else if (hasDirectAccess) {
        // User direct access takes priority over group access (mirrors resolveSpaceAccess)
        if (spaceRole !== null && spaceRole !== undefined) {
            effectiveRole = spaceRole;
        } else {
            const groupRoles = [
                groupSpaceRole,
                ...(groupSpaceRoles ?? []),
            ].filter(
                (r): r is SpaceMemberRole => r !== null && r !== undefined,
            );
            effectiveRole = getHighestSpaceRole(groupRoles);
        }
    } else if (!isPrivate && projectRole) {
        effectiveRole = convertProjectRoleToSpaceRole(projectRole);
    }

    const access: SpaceAccess[] = effectiveRole
        ? [
              {
                  userUuid,
                  role: effectiveRole,
                  hasDirectAccess,
                  inheritedFrom: hasDirectAccess ? undefined : 'project',
                  projectRole: projectRole ?? undefined,
                  inheritedRole: organizationRole,
              },
          ]
        : [];

    return { organizationUuid, projectUuid, isPrivate, access };
};
