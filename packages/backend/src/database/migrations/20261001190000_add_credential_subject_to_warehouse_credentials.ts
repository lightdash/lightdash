import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable sign-in subject column, its foreign key and its index to warehouse_credentials; older binaries never read or write the column',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(`
        ALTER TABLE warehouse_credentials
            ADD COLUMN IF NOT EXISTS credential_subject_user_uuid uuid NULL
                REFERENCES users (user_uuid) ON DELETE SET NULL
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_credentials_credential_subject_user_uuid_idx
        ON warehouse_credentials (credential_subject_user_uuid)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(`
        DROP INDEX IF EXISTS warehouse_credentials_credential_subject_user_uuid_idx
    `);
    await knex.raw(`
        ALTER TABLE warehouse_credentials
            DROP COLUMN IF EXISTS credential_subject_user_uuid
    `);
}
