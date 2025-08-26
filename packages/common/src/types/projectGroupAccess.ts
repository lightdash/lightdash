import { type ProjectMemberRole } from './projectMemberRole';

export type ProjectGroupAccess = {
    projectUuid: string;
    groupUuid: string;
    role: ProjectMemberRole | string; // Support both old enum and new custom role UUIDs
};

export type CreateProjectGroupAccess = ProjectGroupAccess;

export type UpdateProjectGroupAccess = ProjectGroupAccess;

export type DeleteProjectGroupAccess = Pick<
    ProjectGroupAccess,
    'projectUuid' | 'groupUuid'
>;

export type ApiCreateProjectGroupAccess = {
    status: 'ok';
    results: ProjectGroupAccess;
};

export type ApiUpdateProjectGroupAccess = {
    status: 'ok';
    results: ProjectGroupAccess;
};
