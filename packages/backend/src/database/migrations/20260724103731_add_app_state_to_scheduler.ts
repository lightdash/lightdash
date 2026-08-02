import { Knex } from 'knex';

const SCHEDULER_TABLE = 'scheduler';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.jsonb('app_state').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.dropColumn('app_state');
    });
}
