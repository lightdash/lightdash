import { Knex } from 'knex';

export const SchedulerTableName = 'scheduler';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.boolean('include_links').defaultTo(true).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.dropColumn('include_links');
    });
}
