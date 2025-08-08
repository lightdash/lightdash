import type { AbilityAction, CaslSubjectNames } from '../authorization/types';
import type { ApiSuccessEmpty } from './api/success';

export type Scope = {
    scopeUuid: string;
    resource: CaslSubjectNames;
    action: AbilityAction;
    name: string;
    description: string | null;
    createdAt: Date;
};

export type Role = {
    roleUuid: string;
    name: string;
    description: string | null;
    organizationUuid: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
};

export type RoleWithScopes = Role & {
    scopes: Scope[];
};

export type CreateRole = {
    name: string;
    description?: string;
};

export type UpdateRole = {
    name?: string;
    description?: string;
};

export type CreateScope = {
    resource: string;
    action: string;
    description?: string;
};

export type AddScopeToRole = {
    scopeUuids: string[];
};

export type RemoveScopesFromRole = {
    scopeUuids: string[];
};

// API Response Types
export type ApiGetRolesResponse = {
    status: 'ok';
    results: Role[];
};

export type ApiGetRoleResponse = {
    status: 'ok';
    results: RoleWithScopes;
};

export type ApiCreateRoleResponse = {
    status: 'ok';
    results: Role;
};

export type ApiUpdateRoleResponse = {
    status: 'ok';
    results: Role;
};

export type ApiDeleteRoleResponse = ApiSuccessEmpty;

export type ApiAddScopeToRoleResponse = {
    status: 'ok';
    results: Scope[];
};

export type ApiRemoveScopeFromRoleResponse = ApiSuccessEmpty;

export type ApiRemoveScopesFromRoleResponse = ApiSuccessEmpty;

export type ApiGetScopesResponse = {
    status: 'ok';
    results: Scope[];
};
