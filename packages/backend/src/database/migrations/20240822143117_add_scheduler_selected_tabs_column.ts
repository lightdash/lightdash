import { Knex } from 'knex';
import { SchedulerTableName } from '../entities/scheduler';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.specificType('selected_tabs', 'text[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.dropColumn('selected_tabs');
    });
}
