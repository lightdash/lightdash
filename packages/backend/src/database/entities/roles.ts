import { AbilityAction, CaslSubjectNames } from '@lightdash/common';
import { Knex } from 'knex';

export const RolesTableName = 'roles';
export const ScopesTableName = 'scopes';
export const ScopedRolesTableName = 'scoped_roles';

export type DbRole = {
    role_uuid: string;
    name: string;
    description: string | null;
    organization_uuid: string;
    created_by: string;
    created_at: Date;
    updated_at: Date;
};

export type DbRoleInsert = Pick<
    DbRole,
    'name' | 'description' | 'organization_uuid' | 'created_by'
>;

export type DbRoleUpdate = Partial<
    Pick<DbRole, 'name' | 'description' | 'updated_at'>
>;

export type RoleTable = Knex.CompositeTableType<
    DbRole,
    DbRoleInsert,
    DbRoleUpdate
>;

export type DbScope = {
    scope_uuid: string;
    resource: CaslSubjectNames;
    action: AbilityAction;
    name: string;
    description: string | null;
    created_at: Date;
    is_commercial: boolean;
};

export type DbScopeInsert = Pick<
    DbScope,
    'resource' | 'action' | 'description' | 'is_commercial'
>;

export type DbScopeUpdate = Partial<Pick<DbScope, 'description'>>;

export type ScopeTable = Knex.CompositeTableType<
    DbScope,
    DbScopeInsert,
    DbScopeUpdate
>;

export type DbScopedRole = {
    role_uuid: string;
    scope_uuid: string;
    granted_at: Date;
    granted_by: string;
};

export type DbScopedRoleInsert = Pick<
    DbScopedRole,
    'role_uuid' | 'scope_uuid' | 'granted_by'
>;

export type ScopedRoleTable = Knex.CompositeTableType<
    DbScopedRole,
    DbScopedRoleInsert
>;
