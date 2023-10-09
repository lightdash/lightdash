import { Knex } from 'knex';

const SchedulerLogTableName = 'scheduler_log';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerLogTableName, (table) => {
        table.uuid('scheduler_uuid').nullable().alter();
        table.string('job_group').nullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    // Delete first all nullable values
    await knex(SchedulerLogTableName).delete().whereNull('scheduler_uuid');

    await knex.schema.alterTable(SchedulerLogTableName, (table) => {
        table.uuid('scheduler_uuid').notNullable().alter();
        table.string('job_group').notNullable().alter();
    });
}
