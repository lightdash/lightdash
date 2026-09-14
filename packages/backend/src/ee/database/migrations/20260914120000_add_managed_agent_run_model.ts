import { type Knex } from 'knex';

const tableName = 'managed_agent_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(tableName, (table) => {
        // Historical runs have no reliable attribution; do not backfill from
        // the current organization configuration.
        table.text('model_provider').nullable();
        table.text('model_name').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumns('model_provider', 'model_name');
    });
}
