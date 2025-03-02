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
    organizationUuid?: string;
    projectUuid?: string;
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
            })) || []),
            ...(projectRole
                ? [{ projectUuid, role: projectRole, userUuid }]
                : []),
        ],
        [
            { groupUuid: 'test-group-uuid-1' },
            { groupUuid: 'test-group-uuid-2' },
            { groupUuid: 'test-group-uuid-3' }
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
    organizationUuid = 'test-org-uuid',
    projectUuid = 'test-project-uuid',
    projectGroupRoles = [],
    isPrivate = true,
}: TestAccessParams = {}) => ({
    is_private: isPrivate,
    project_uuid: projectUuid,
    organization_uuid: organizationUuid,
    user_access: spaceRole ? [{ userUuid, role: spaceRole }] : [],
    group_access: [
        ...(groupSpaceRole ? [{ groupUuid: 'test-group-uuid-1', role: groupSpaceRole }] : []),
        ...(groupSpaceRoles?.map((role, i) => ({ 
            groupUuid: `test-group-uuid-${i + 1}`, 
            role,
        })) || []),

    ],
});
