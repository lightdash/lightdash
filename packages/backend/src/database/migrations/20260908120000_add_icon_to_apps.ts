import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable icon column to apps without reading, defaulting or rewriting existing rows',
} as const;

const AppsTableName = 'apps';
const IconColumn = 'icon';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        // Curated icon name for a custom chart type; null means no icon.
        table.text(IconColumn).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        table.dropColumn(IconColumn);
    });
}
