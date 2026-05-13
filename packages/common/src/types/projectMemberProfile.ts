import { type ProjectMemberRole } from './projectMemberRole';

export type ProjectMemberProfile = {
    userUuid: string;
    projectUuid: string;
    role: ProjectMemberRole;
    roleUuid: string | undefined;
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

export type ServiceAccountProjectAccess = {
    serviceAccountUuid: string;
    description: string;
    role: ProjectMemberRole;
    expiresAt: Date | null;
};

export type CreateServiceAccountProjectAccess = {
    serviceAccountUuid: string;
    role: ProjectMemberRole;
};

export type UpdateServiceAccountProjectAccess = {
    role: ProjectMemberRole;
};

export type ApiServiceAccountProjectAccessListResponse = {
    status: 'ok';
    results: ServiceAccountProjectAccess[];
};
