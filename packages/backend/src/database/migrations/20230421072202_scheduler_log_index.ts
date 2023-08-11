import { Knex } from 'knex';

const SchedulerLogTableName = 'scheduler_log';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SchedulerLogTableName)) {
        await knex.schema.alterTable(SchedulerLogTableName, (table) => {
            table.index(['scheduler_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SchedulerLogTableName)) {
        await knex.schema.alterTable(SchedulerLogTableName, (table) => {
            table.dropIndex(['scheduler_uuid']);
        });
    }
}
