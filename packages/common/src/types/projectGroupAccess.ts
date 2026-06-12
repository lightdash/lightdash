import { type ProjectMemberRole } from './projectMemberRole';

export type ProjectGroupAccess = {
    projectUuid: string;
    groupUuid: string;
    // System role values surface in IntelliSense while still allowing a custom-role
    // UUID (any string). `string & {}` only stops TS from collapsing the union to
    // `string` for autocomplete — it adds no type safety, so consumers must still
    // guard with `isSystemRole` before using this as a system role.
    role: ProjectMemberRole | (string & {});
};

export type CreateProjectGroupAccess = ProjectGroupAccess;

export type UpdateProjectGroupAccess = ProjectGroupAccess;

export type DeleteProjectGroupAccess = Pick<
    ProjectGroupAccess,
    'projectUuid' | 'groupUuid'
>;

/**
 * One entry in the `LD_SETUP_GROUP_PROJECT_ACCESS` instance-config env var. The
 * group is referenced by name (and the project optionally by name) because
 * SCIM-synced groups are created by the IdP, so their UUIDs aren't known at
 * deploy time. `role` is a system role (e.g. "developer") or a custom role name.
 */
export type GroupProjectAccessSetupEntry = {
    groupName: string;
    projectName?: string;
    projectUuid?: string;
    role: string;
};

export type ApiCreateProjectGroupAccess = {
    status: 'ok';
    results: ProjectGroupAccess;
};

export type ApiUpdateProjectGroupAccess = {
    status: 'ok';
    results: ProjectGroupAccess;
};
