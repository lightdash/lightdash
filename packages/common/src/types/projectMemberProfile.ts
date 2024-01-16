import assertUnreachable from '../utils/assertUnreachable';

export enum ProjectMemberRole {
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

export const getHighestProjectRole = (
    roles: ProjectMemberRole[],
): ProjectMemberRole | undefined => {
    if (roles.length === 0) {
        return undefined;
    }

    if (roles.includes(ProjectMemberRole.ADMIN)) {
        return ProjectMemberRole.ADMIN;
    }
    if (roles.includes(ProjectMemberRole.DEVELOPER)) {
        return ProjectMemberRole.DEVELOPER;
    }
    if (roles.includes(ProjectMemberRole.EDITOR)) {
        return ProjectMemberRole.EDITOR;
    }
    if (roles.includes(ProjectMemberRole.INTERACTIVE_VIEWER)) {
        return ProjectMemberRole.INTERACTIVE_VIEWER;
    }
    if (roles.includes(ProjectMemberRole.VIEWER)) {
        return ProjectMemberRole.VIEWER;
    }

    return undefined;
};

export type ProjectMemberProfile = {
    userUuid: string;
    projectUuid: string;
    role: ProjectMemberRole;
    email: string;
    firstName: string;
    lastName: string;
};

export type ProjectMemberProfileUpdate = Partial<
    Pick<ProjectMemberProfile, 'role'>
>;

export type ApiProjectAccessListResponse = {
    status: 'ok';
    results: ProjectMemberProfile[];
};

export type ApiGetProjectMemberResponse = {
    status: 'ok';
    results: ProjectMemberProfile;
};
