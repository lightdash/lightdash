import type { ApiSuccessEmpty } from './api/success';

export type ProjectAccess = {
    projectUuid: string;
    userUuid: string;
    roleUuid: string;
    roleName: string;
    firstName: string;
    lastName: string;
};

export type GroupProjectAccess = {
    groupUuid: string;
    projectUuid: string;
    roleUuid: string;
    roleName: string;
    groupName: string;
};

export type Role = {
    roleUuid: string;
    name: string;
    description: string | null;
    organizationUuid: string | null; // System roles don't have an organization
    ownerType: 'user' | 'system';
    createdBy: string | null;
    createdAt: Date | null; // System roles don't have dates
    updatedAt: Date | null;
};

export type RoleWithScopes = Role & {
    scopes: string[];
};

export type CreateRole = {
    name: string;
    description?: string;
    scopes?: string[];
};

export type UpdateRole = {
    name?: string;
    description?: string;
    scopes?: {
        add: string[];
        remove: string[];
    };
};

export type AddScopesToRole = {
    scopeNames: string[];
};

// API Response Types
export type ApiGetRolesResponse = {
    status: 'ok';
    results: Role[] | RoleWithScopes[];
};

export type ApiRoleWithScopesResponse = {
    status: 'ok';
    results: RoleWithScopes;
};

export type ApiDefaultRoleResponse = {
    status: 'ok';
    results: Role;
};

export type ApiDeleteRoleResponse = ApiSuccessEmpty;

export type ApiRemoveScopeFromRoleResponse = ApiSuccessEmpty;

export type ApiUnassignRoleFromUserResponse = ApiSuccessEmpty;

export type ApiGetProjectAccessResponse = {
    status: 'ok';
    results: {
        users: ProjectAccess[];
        groups: GroupProjectAccess[];
    };
};

// Unified Assignment Types
export type RoleAssignment = {
    roleId: string;
    roleName: string;
    ownerType: 'user' | 'system';
    assigneeType: 'user' | 'group';
    assigneeId: string;
    assigneeName: string;
    organizationId?: string; // for org-level assignments
    projectId?: string; // for project-level assignments
    createdAt: Date;
    updatedAt: Date;
};

export type CreateRoleAssignmentRequest = {
    roleId: string;
    assigneeType: 'user' | 'group';
    assigneeId: string;
};

export type CreateUserRoleAssignmentRequest = {
    roleId: string;
};

export type CreateGroupRoleAssignmentRequest = {
    roleId: string;
};

export type UpdateRoleAssignmentRequest = {
    roleId: string;
};

export type UpsertUserRoleAssignmentRequest = {
    roleId: string;
    sendEmail?: boolean;
};

// API Response Types for Unified Assignments
export type ApiRoleAssignmentResponse = {
    status: 'ok';
    results: RoleAssignment;
};

export type ApiRoleAssignmentListResponse = {
    status: 'ok';
    results: RoleAssignment[];
};
