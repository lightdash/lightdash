import { type ProjectMemberRole } from './projectMemberRole';

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
