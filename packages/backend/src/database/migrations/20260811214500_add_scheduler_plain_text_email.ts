import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.boolean('plain_text_email').defaultTo(false).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.dropColumn('plain_text_email');
    });
}
