import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.integer('custom_viewport_width').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(SchedulerTableName, 'custom_viewport_width')
    ) {
        await knex.schema.alterTable(SchedulerTableName, (table) => {
            table.dropColumn('custom_viewport_width');
        });
    }
}
