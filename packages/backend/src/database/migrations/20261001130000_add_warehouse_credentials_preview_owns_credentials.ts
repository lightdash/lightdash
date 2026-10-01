import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable preview_owns_credentials column to warehouse_credentials',
} as const;

const tableName = 'warehouse_credentials';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(
        `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS preview_owns_credentials BOOLEAN NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(
        `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS preview_owns_credentials`,
    );
}
