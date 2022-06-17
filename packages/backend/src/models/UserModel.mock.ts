import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';

export const orgProfile: OrganizationMemberProfile = {
    userUuid: 'user-uuid-1234',
    role: OrganizationMemberRole.VIEWER,
    email: '',
    firstName: '',
    lastName: '',
    organizationUuid: 'organization-uuid-view',
    isActive: true,
};
export const projectProfile: ProjectMemberProfile = {
    userUuid: 'user-uuid-1234',
    role: ProjectMemberRole.VIEWER,
    projectUuid: 'project-uuid-view',
    email: '',
    firstName: '',
    lastName: '',
};

export const adminOrgProfile = {
    ...orgProfile,
    role: OrganizationMemberRole.ADMIN,
    organizationUuid: 'organization-uuid-admin',
};

export const adminProjectProfile = {
    ...projectProfile,
    role: ProjectMemberRole.ADMIN,
    projectUuid: 'project-uuid-admin',
};

export const conditions = {
    organizationUuid: orgProfile.organizationUuid,
    projectUuid: projectProfile.projectUuid,
};
