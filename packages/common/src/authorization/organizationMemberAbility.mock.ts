import {
    OrganizationMemberRole,
    type OrganizationMemberProfile,
} from '../types/organizationMemberProfile';

export const ORGANIZATION_MEMBER: OrganizationMemberProfile = {
    userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce', // when insert to space_user_access table, a dummy value like '123' will fail uuid format check
    organizationUuid: '456',
    role: OrganizationMemberRole.MEMBER,
    firstName: 'jane',
    lastName: 'jackson',
    email: 'jane@gmail.com',
    isActive: true,
    userCreatedAt: new Date(),
    userUpdatedAt: new Date(),
};

export const ORGANIZATION_VIEWER: OrganizationMemberProfile = {
    ...ORGANIZATION_MEMBER,
    role: OrganizationMemberRole.VIEWER,
};
export const ORGANIZATION_INTERACTIVE_VIEWER: OrganizationMemberProfile = {
    ...ORGANIZATION_MEMBER,
    role: OrganizationMemberRole.INTERACTIVE_VIEWER,
};
export const ORGANIZATION_EDITOR: OrganizationMemberProfile = {
    ...ORGANIZATION_MEMBER,
    role: OrganizationMemberRole.EDITOR,
};
export const ORGANIZATION_DEVELOPER: OrganizationMemberProfile = {
    ...ORGANIZATION_MEMBER,
    role: OrganizationMemberRole.DEVELOPER,
};

export const ORGANIZATION_ADMIN: OrganizationMemberProfile = {
    ...ORGANIZATION_MEMBER,
    role: OrganizationMemberRole.ADMIN,
};
