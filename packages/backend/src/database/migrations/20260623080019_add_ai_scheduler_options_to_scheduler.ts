import { Knex } from 'knex';

const SCHEDULER_TABLE = 'scheduler';
const COLUMN = 'ai_scheduler_options';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.jsonb(COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SCHEDULER_TABLE, (table) => {
        table.dropColumn(COLUMN);
    });
}
