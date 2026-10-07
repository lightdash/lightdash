import { Knex } from 'knex';

export type DbDepartment = {
    department_uuid: string;
    organization_uuid: string;
    parent_department_uuid: string | null;
    name: string;
    headcount: number | null;
    headcount_note: string | null;
    target_active_users: number | null;
    target_date: string | null;
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
    | 'target_date'
    | 'updated_by_user_uuid'
>;
type DbDepartmentUpdate = Partial<
    Pick<
        DbDepartment,
        | 'parent_department_uuid'
        | 'name'
        | 'headcount'
        | 'headcount_note'
        | 'target_active_users'
        | 'target_date'
        | 'updated_by_user_uuid'
        | 'updated_at'
    >
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
