import { Knex } from 'knex';

export type DbDepartment = {
    department_uuid: string;
    organization_uuid: string;
    parent_department_uuid: string | null;
    name: string;
    headcount: number | null;
    headcount_note: string | null;
    target_active_users: number | null;
    // Raw driver type for a date column; the model reads it as text via to_char
    target_date: Date | null;
    created_at: Date;
    updated_at: Date;
    updated_by_user_uuid: string | null;
};
type DbDepartmentCreate = Pick<
    DbDepartment,
    | 'organization_uuid'
    | 'parent_department_uuid'
    | 'name'
    | 'headcount'
    | 'headcount_note'
    | 'target_active_users'
    | 'updated_by_user_uuid'
> & { target_date: string | null };
type DbDepartmentUpdate = Partial<
    Pick<
        DbDepartment,
        | 'parent_department_uuid'
        | 'name'
        | 'headcount'
        | 'headcount_note'
        | 'target_active_users'
        | 'updated_by_user_uuid'
        | 'updated_at'
    > & { target_date: string | null }
>;
export const DepartmentTableName = 'organization_departments';
export type DepartmentTable = Knex.CompositeTableType<
    DbDepartment,
    DbDepartmentCreate,
    DbDepartmentUpdate
>;

export type DepartmentLinkType = 'group' | 'space' | 'project';
export type DbDepartmentLink = {
    department_uuid: string;
    link_type: DepartmentLinkType;
    link_uuid: string;
};
export const DepartmentLinkTableName = 'department_links';
export type DepartmentLinkTable = Knex.CompositeTableType<
    DbDepartmentLink,
    DbDepartmentLink,
    never
>;

export type DbDepartmentMember = { department_uuid: string; user_uuid: string };
export const DepartmentMemberTableName = 'department_members';
export type DepartmentMemberTable = Knex.CompositeTableType<
    DbDepartmentMember,
    DbDepartmentMember,
    never
>;

// Where a person placed in several departments counts; at most one per person per organization
export type DbDepartmentPrimaryMembership = {
    organization_uuid: string;
    user_uuid: string;
    department_uuid: string;
};
export const DepartmentPrimaryMembershipTableName =
    'department_primary_memberships';
export type DepartmentPrimaryMembershipTable = Knex.CompositeTableType<
    DbDepartmentPrimaryMembership,
    DbDepartmentPrimaryMembership,
    Pick<DbDepartmentPrimaryMembership, 'department_uuid'>
>;

export type DepartmentPrincipalType = 'user' | 'group';
export type DbDepartmentOwner = {
    department_uuid: string;
    principal_type: DepartmentPrincipalType;
    principal_uuid: string;
    position: number;
};
export const DepartmentOwnerTableName = 'department_owners';
export type DepartmentOwnerTable = Knex.CompositeTableType<
    DbDepartmentOwner,
    DbDepartmentOwner,
    never
>;
