import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.jsonb('parameters').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SchedulerTableName, 'parameters')) {
        await knex.schema.alterTable(SchedulerTableName, (table) => {
            table.dropColumn('parameters');
        });
    }
}
