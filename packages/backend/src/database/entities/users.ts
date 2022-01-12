import { Knex } from 'knex';

export type DbUser = {
    user_id: number;
    user_uuid: string;
    first_name: string;
    last_name: string;
    created_at: Date;
    is_marketing_opted_in: boolean;
    is_tracking_anonymized: boolean;
};

export type DbUserIn = Pick<
    DbUser,
    | 'first_name'
    | 'last_name'
    | 'is_marketing_opted_in'
    | 'is_tracking_anonymized'
> &
    Partial<Pick<DbUser, 'user_uuid'>>;
export type DbUserUpdate = Pick<DbUser, 'first_name' | 'last_name'>;

export type UserTable = Knex.CompositeTableType<DbUser, DbUserIn, DbUserUpdate>;

export const UserTableName = 'users';
