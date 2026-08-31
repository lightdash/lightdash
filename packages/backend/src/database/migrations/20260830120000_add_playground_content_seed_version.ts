import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable integer column without rewriting existing rows',
} as const;

const ONBOARDING_TABLE = 'onboarding';
const SEED_VERSION_COLUMN = 'playground_content_seed_version';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(ONBOARDING_TABLE, (table) => {
        table.integer(SEED_VERSION_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(ONBOARDING_TABLE, (table) => {
        table.dropColumn(SEED_VERSION_COLUMN);
    });
}
