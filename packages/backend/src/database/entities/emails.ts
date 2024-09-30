import { Knex } from 'knex';

export type DbEmail = {
    email_id: number;
    user_id: number;
    created_at: Date;
    email: string;
    is_primary: boolean;
    is_verified: boolean;
};

export type DbEmailIn = Pick<DbEmail, 'user_id' | 'email' | 'is_primary'>;
export type DbEmailRemove = Pick<DbEmail, 'user_id' | 'email'>;
export type DbEmailUpdate = Pick<DbEmail, 'is_verified'>;

export type EmailTable = Knex.CompositeTableType<
    DbEmail,
    DbEmailIn,
    DbEmailUpdate
>;

export const EmailTableName = 'emails';

// DB Errors:
// user_id does not exist (foreign key)
// email already exists (not unique)
// user already has a primary address set (constraint)
// MOVED
export const createEmail = async (db: Knex, emailIn: DbEmailIn) => {
    await db<DbEmail>('emails').insert<DbEmailIn>(emailIn);
};

// MOVED
export const deleteEmail = async (db: Knex, emailRemove: DbEmailRemove) => {
    await db<DbEmail>('emails').where(emailRemove).delete();
};
