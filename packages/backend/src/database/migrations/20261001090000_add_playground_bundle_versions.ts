import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable text column and a new table without rewriting existing rows',
} as const;

const PROJECTS_TABLE = 'projects';
const BUNDLE_VERSION_COLUMN = 'playground_bundle_version';
const BUNDLE_VERSIONS_TABLE = 'playground_bundle_versions';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.text(BUNDLE_VERSION_COLUMN).nullable();
    });
    await knex.schema.createTable(BUNDLE_VERSIONS_TABLE, (table) => {
        table.text('version').primary();
        table
            .timestamp('first_seen_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.dropTable(BUNDLE_VERSIONS_TABLE);
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.dropColumn(BUNDLE_VERSION_COLUMN);
    });
}
