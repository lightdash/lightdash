import { Knex } from 'knex';

export type DbPasswordLogin = {
    user_id: number;
    password_hash: string;
    created_at: Date;
    failed_attempt_count: number;
    last_attempt_at: Date;
    blocked_until: Date | null;
};

export type DbPasswordLoginIn = Pick<
    DbPasswordLogin,
    'user_id' | 'password_hash'
>;

export const PasswordLoginTableName = 'password_logins';

export type PasswordLoginTable = Knex.CompositeTableType<
    DbPasswordLogin,
    DbPasswordLoginIn,
    Partial<
        Pick<
            DbPasswordLogin,
            | 'password_hash'
            | 'failed_attempt_count'
            | 'last_attempt_at'
            | 'blocked_until'
        >
    >
>;
