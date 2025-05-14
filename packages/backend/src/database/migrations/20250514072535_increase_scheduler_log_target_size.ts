import { Knex } from 'knex';

const SchedulerLogTableName = 'scheduler_log';

export async function up(knex: Knex): Promise<void> {
    // Alter the column type from varchar(255) to text
    await knex.schema.alterTable(SchedulerLogTableName, (table) => {
        table.text('target').alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerLogTableName, (table) => {
        table.string('target').alter();
    });
}
