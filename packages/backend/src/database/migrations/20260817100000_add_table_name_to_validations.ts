import { Knex } from 'knex';

const ValidationTableName = 'validations';

// Adding a nullable column with no default is a catalog-only change in
// Postgres: instant regardless of table size. No index on purpose — every
// read of this table is already scoped by the indexed project_uuid, and
// per-project row counts are small (the table is fully rewritten per
// validation run), so table_name works as a residual filter.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (table) => {
        table.text('table_name').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (table) => {
        table.dropColumn('table_name');
    });
}
