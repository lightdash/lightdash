export enum ProjectMemberRole {
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

export type ProjectMemberProfile = {
    userUuid: string;
    projectUuid: string;
    role: ProjectMemberRole;
};

export type ProjectMemberProfileUpdate = Partial<
    Pick<ProjectMemberProfile, 'role'>
>;
