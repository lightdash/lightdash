import { Knex } from 'knex';

const TABLE_NAME = 'persistent_download_files';
const CONSTRAINT_NAME = 'persistent_download_files_storage_check';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted column and validates its CHECK constraint outside the ACCESS EXCLUSIVE lock, so the previous release keeps reading and inserting rows unchanged.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw("SET lock_timeout = '5s'");
        await knex.raw(
            `ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'exports'`,
        );
        const constraint = await knex.raw(
            `SELECT 1 FROM pg_constraint WHERE conrelid = '${TABLE_NAME}'::regclass AND conname = '${CONSTRAINT_NAME}'`,
        );
        if (constraint.rows.length === 0) {
            await knex.raw(
                `ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT ${CONSTRAINT_NAME} CHECK (storage IN ('exports', 'uploads')) NOT VALID`,
            );
        }
        await knex.raw(
            `ALTER TABLE ${TABLE_NAME} VALIDATE CONSTRAINT ${CONSTRAINT_NAME}`,
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    await knex.raw(
        `ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}`,
    );
    await knex.raw(`ALTER TABLE ${TABLE_NAME} DROP COLUMN IF EXISTS storage`);
}
