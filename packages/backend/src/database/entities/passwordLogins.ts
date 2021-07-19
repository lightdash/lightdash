import { Knex } from 'knex';

export type DbPasswordLogin = {
    user_id: number;
    password_hash: string;
    created_at: Date;
};

export type DbPasswordLoginIn = {
    user_id: number;
    password_hash: string;
};

// DB Errors:
// user_id does not exist (foreign key)
// user_id already has password (not unique)
export const createPasswordLogin = async (
    db: Knex,
    passwordLoginIn: DbPasswordLoginIn,
) => {
    await db<DbPasswordLogin>('password_logins').insert<DbPasswordLoginIn>(
        passwordLoginIn,
    );
};
