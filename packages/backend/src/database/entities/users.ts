import { Knex } from 'knex';

export type DbUser = {
    user_id: number;
    user_uuid: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_marketing_opted_in: boolean;
    is_tracking_anonymized: boolean;
    is_setup_complete: boolean;
    is_active: boolean;
    // True when the user record exists for system plumbing rather than a
    // self-registered human. Today: service accounts. Future: persisted
    // embed users, AI agents, etc. Used only to filter these rows out of
    // human-facing surfaces (org member listings, SCIM, search, login).
    is_internal: boolean;
    updated_at: Date;
};

export type DbUserIn = Pick<
    DbUser,
    | 'first_name'
    | 'last_name'
    | 'is_marketing_opted_in'
    | 'is_tracking_anonymized'
    | 'is_setup_complete'
    | 'is_active'
> &
    Partial<Pick<DbUser, 'user_uuid' | 'is_internal'>>;
export type DbUserUpdate = Partial<
    Pick<
        DbUser,
        | 'first_name'
        | 'last_name'
        | 'is_marketing_opted_in'
        | 'is_tracking_anonymized'
        | 'is_setup_complete'
        | 'is_active'
        | 'updated_at'
    >
>;

export type UserTable = Knex.CompositeTableType<DbUser, DbUserIn, DbUserUpdate>;

export const UserTableName = 'users';
