import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SchedulerTableName)) {
        await knex.schema.alterTable(SchedulerTableName, (table) => {
            table.string('format').defaultTo('image').notNullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (tableBuilder) => {
        tableBuilder.dropColumn('format');
    });
}
