import { Knex } from 'knex';

const SchedulerLogTableName = 'scheduler_log';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SchedulerLogTableName)) {
        await knex.schema.alterTable(SchedulerLogTableName, (table) => {
            // Add composite index on (job_group, job_id)
            table.index(['job_group', 'job_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SchedulerLogTableName)) {
        await knex.schema.alterTable(SchedulerLogTableName, (table) => {
            table.dropIndex(['job_group', 'job_id']);
        });
    }
}
