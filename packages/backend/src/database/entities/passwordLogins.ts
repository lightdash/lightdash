import bcrypt from 'bcrypt';
import { Knex } from 'knex';
import database from '../database';

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

export const updatePassword = async (
    userId: number,
    newPassword: string,
): Promise<void> => {
    await database<DbPasswordLogin>('password_logins')
        .where({
            user_id: userId,
        })
        .update({
            password_hash: await bcrypt.hash(
                newPassword,
                await bcrypt.genSalt(),
            ),
        });
};
