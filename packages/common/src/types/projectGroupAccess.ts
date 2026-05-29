import { type ProjectMemberRole } from './projectMemberRole';

export type ProjectGroupAccess = {
    projectUuid: string;
    groupUuid: string;
    // System role values surface in IntelliSense while still allowing a custom-role
    // UUID (any string). `string & {}` only stops TS from collapsing the union to
    // `string` for autocomplete — it adds no type safety, so consumers must still
    // guard with `isProjectMemberRole` before using this as a system role.
    role: ProjectMemberRole | (string & {});
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
