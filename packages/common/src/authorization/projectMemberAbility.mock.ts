import {
    ProjectMemberProfile,
    ProjectMemberRole,
} from '../types/projectMemberProfile';

export const PROJECT_VIEWER: ProjectMemberProfile = {
    userUuid: 'user-uuid-1234',
    projectUuid: 'project-uuid-1234',
    role: ProjectMemberRole.VIEWER,
    email: '',
    firstName: '',
    lastName: '',
};

export const PROJECT_EDITOR: ProjectMemberProfile = {
    ...PROJECT_VIEWER,
    role: ProjectMemberRole.EDITOR,
};

export const PROJECT_ADMIN: ProjectMemberProfile = {
    ...PROJECT_VIEWER,
    role: ProjectMemberRole.ADMIN,
};
