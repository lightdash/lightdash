import { type Knex } from 'knex';

const AppVersionsTableName = 'app_versions';

/**
 * Token/cost spend for the version's generation.
 *
 * Nullable with no default, so the ALTER is metadata-only: existing rows stay
 * NULL, which reads as "not recorded" rather than "spent nothing".
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.jsonb('generation_usage').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.dropColumn('generation_usage');
    });
}
