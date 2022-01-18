import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '../types/organizationMemberProfile';

export const ORGANIZATION_VIEWER: OrganizationMemberProfile = {
    userUuid: '123',
    organizationUuid: '456',
    role: OrganizationMemberRole.VIEWER,
    firstName: 'jane',
    lastName: 'jackson',
    email: 'jane@gmail.com',
};

export const ORGANIZATION_EDITOR: OrganizationMemberProfile = {
    ...ORGANIZATION_VIEWER,
    role: OrganizationMemberRole.EDITOR,
};

export const ORGANIZATION_ADMIN: OrganizationMemberProfile = {
    ...ORGANIZATION_VIEWER,
    role: OrganizationMemberRole.ADMIN,
};
