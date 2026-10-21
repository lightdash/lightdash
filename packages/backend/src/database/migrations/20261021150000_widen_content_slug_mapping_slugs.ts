import { Knex } from 'knex';

const SavedQuerySlugMappingsTableName = 'saved_query_slug_mappings';
const DashboardSlugMappingsTableName = 'dashboard_slug_mappings';

// Current slugs live in `text` columns with no length cap, so renaming a chart
// or dashboard whose slug exceeds 255 characters failed when its old slug was
// recorded as a historical alias. Widening is metadata-only in Postgres.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQuerySlugMappingsTableName, (table) => {
        table.text('slug').alter({ alterNullable: false });
    });
    await knex.schema.alterTable(DashboardSlugMappingsTableName, (table) => {
        table.text('slug').alter({ alterNullable: false });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQuerySlugMappingsTableName, (table) => {
        table.string('slug', 255).alter({ alterNullable: false });
    });
    await knex.schema.alterTable(DashboardSlugMappingsTableName, (table) => {
        table.string('slug', 255).alter({ alterNullable: false });
    });
}
