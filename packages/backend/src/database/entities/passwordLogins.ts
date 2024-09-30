import { Knex } from 'knex';

export type DbPasswordLogin = {
    user_id: number;
    password_hash: string;
    created_at: Date;
};

export type DbPasswordLoginIn = Pick<
    DbPasswordLogin,
    'user_id' | 'password_hash'
>;

export const PasswordLoginTableName = 'password_logins';

export type PasswordLoginTable = Knex.CompositeTableType<
    DbPasswordLogin,
    DbPasswordLoginIn
>;
