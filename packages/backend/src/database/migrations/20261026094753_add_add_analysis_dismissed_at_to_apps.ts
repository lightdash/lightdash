import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable timestamp column to apps; existing rows read back as null without a rewrite',
} as const;

const AppsTableName = 'apps';
const Column = 'add_analysis_dismissed_at';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        // When the builder-side "add AI analysis" offer was dismissed for
        // this app (closed, or acted on once); null = never dismissed.
        table.timestamp(Column, { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        table.dropColumn(Column);
    });
}
