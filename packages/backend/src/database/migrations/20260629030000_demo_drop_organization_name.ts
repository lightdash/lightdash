import { Knex } from 'knex';

// DEMO MIGRATION (PROD-8359 test matrix) — do not merge.
// Drops a column the app CODE still references (organization_name). The AI review
// should grep the previous release, find live reads/writes, and confirm this is a
// genuine break (not an expand/contract) → Recreate.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.dropColumn('organization_name');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.string('organization_name').nullable();
    });
}
