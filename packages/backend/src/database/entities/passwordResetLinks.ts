import { Knex } from 'knex';

type DbPasswordReset = {
    code_hash: string;
    email_id: number;
    created_at: Date;
    expires_at: Date;
};

type DbPasswordResetInsert = Pick<
    DbPasswordReset,
    'email_id' | 'code_hash' | 'expires_at'
>;

export type PasswordResetTable = Knex.CompositeTableType<
    DbPasswordReset,
    DbPasswordResetInsert
>;

export const PasswordResetTableName = 'password_reset_links';
