import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';
const ProjectTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SchedulerTableName)) {
        await knex.schema.alterTable(SchedulerTableName, (table) => {
            table.string('timezone').nullable();
        });
    }

    if (await knex.schema.hasTable(ProjectTableName)) {
        await knex.schema.alterTable(ProjectTableName, (table) => {
            table.string('scheduler_timezone').defaultTo('UTC').notNullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (tableBuilder) => {
        tableBuilder.dropColumn('timezone');
    });

    await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
        tableBuilder.dropColumn('scheduler_timezone');
    });
}
