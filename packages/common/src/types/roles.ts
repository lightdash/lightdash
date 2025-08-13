import type { ApiSuccessEmpty } from './api/success';

export type Role = {
    roleUuid: string;
    name: string;
    description: string | null;
    organizationUuid: string;
    ownerType: 'user' | 'system';
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type RoleWithScopes = Role & {
    scopes: string[];
};

export type CreateRole = {
    name: string;
    description?: string;
};

export type UpdateRole = {
    name?: string;
    description?: string;
};

export type AddScopesToRole = {
    scopeNames: string[];
};

// API Response Types
export type ApiGetRolesResponse = {
    status: 'ok';
    results: Role[];
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
