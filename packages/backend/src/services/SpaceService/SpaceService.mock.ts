import {
    defineUserAbility,
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
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

export const createSpaceAccessResponse = ({
    spaceUuid = 'test-space-uuid',
    userUuid = 'test-user-uuid',
    organizationRole = OrganizationMemberRole.MEMBER,
    projectRole,
    spaceRole = null,
    groupSpaceRole = null,
    groupSpaceRoles,
    projectGroupRoles = [],
    isPrivate = true,
}: TestAccessParams = {}) => ({
    space_uuid: spaceUuid,
    user_uuid: userUuid,
    first_name: 'Test',
    last_name: 'User',
    email: 'test@lightdash.com',
    is_private: isPrivate,
    space_role: spaceRole,
    // Have to copy logic from the select query waaaah
    user_with_direct_access:
        spaceRole !== null ||
        groupSpaceRole !== null ||
        groupSpaceRoles?.length,
    // end biz logic
    project_role: projectRole,
    organization_role: organizationRole,
    group_roles: projectGroupRoles,
    space_group_roles:
        groupSpaceRoles || (groupSpaceRole ? [groupSpaceRole] : []),
});
