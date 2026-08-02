import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';
const SEMANTIC_LAYER_PGWIRE_COLUMN = 'semantic_layer_pgwire_enabled';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        // Per-org enablement of the semantic-layer Postgres wire integration.
        // Opt-in only: nullable with no env default, so NULL/absent is treated
        // as false (integration disabled).
        table.boolean(SEMANTIC_LAYER_PGWIRE_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        table.dropColumn(SEMANTIC_LAYER_PGWIRE_COLUMN);
    });
}
