import { Knex } from 'knex';

// DEMO MIGRATION (PROD-8359 preview validation) — do not merge.
// Drops a column in up(), which is breaking for the previous release's pods
// during a rolling update: they keep reading the column until the rollout
// finishes. The release-safety SQL-shape linter should flag this deterministically.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('dashboards', (table) => {
        table.dropColumn('legacy_layout_config');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('dashboards', (table) => {
        table.jsonb('legacy_layout_config').nullable();
    });
}
