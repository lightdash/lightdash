import { Knex } from 'knex';

// DEMO MIGRATION (PROD-8359 preview validation) — do not merge.
// Adds a NULLABLE column to an existing table. This is additive: the previous
// release's pods can keep inserting/reading rows without it during a rolling
// update. The SQL linter stays clean, so the AI migration review runs and should
// verify the old code doesn't depend on the new column and clear it to safe.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('dashboards', (table) => {
        table.text('preview_image_url').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('dashboards', (table) => {
        table.dropColumn('preview_image_url');
    });
}
