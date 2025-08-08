import { Knex } from 'knex';

export const RolesTableName = 'roles';
export const ScopedRolesTableName = 'scoped_roles';

export type DbRole = {
    role_uuid: string;
    name: string;
    description: string | null;
    organization_uuid: string;
    created_by: string | null;
    owner_type: 'user' | 'system';
    created_at: Date;
    updated_at: Date;
};

export type DbRoleInsert = Pick<
    DbRole,
    'name' | 'description' | 'organization_uuid'
> & {
    created_by: string; // Required on insert, but can become null later
};

export type DbRoleUpdate = Partial<
    Pick<DbRole, 'name' | 'description' | 'updated_at'>
>;

export type RoleTable = Knex.CompositeTableType<
    DbRole,
    DbRoleInsert,
    DbRoleUpdate
>;

export type DbScopedRole = {
    role_uuid: string;
    scope_name: string;
    granted_at: Date;
    granted_by: string;
};

export type DbScopedRoleInsert = Pick<
    DbScopedRole,
    'role_uuid' | 'scope_name' | 'granted_by'
>;

export type ScopedRoleTable = Knex.CompositeTableType<
    DbScopedRole,
    DbScopedRoleInsert
>;
