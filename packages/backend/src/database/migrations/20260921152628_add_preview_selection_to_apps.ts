import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable jsonb column to apps without reading, defaulting or rewriting existing rows',
} as const;

const AppsTableName = 'apps';
const PreviewSelectionColumn = 'data_app_viz_preview_selection';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        // Last preview data selection a chart type author ran in Chart Studio:
        // explore, chart inputs and query shape only, never result rows.
        table.jsonb(PreviewSelectionColumn).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        table.dropColumn(PreviewSelectionColumn);
    });
}
