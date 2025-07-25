import { Knex } from 'knex';

const PROJECT_PARAMETERS_TABLE_NAME = 'project_parameters';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(PROJECT_PARAMETERS_TABLE_NAME, (table) => {
        table.uuid('project_uuid').notNullable();
        table.string('name').notNullable();
        table.jsonb('config').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');

        table.primary(['project_uuid', 'name']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(PROJECT_PARAMETERS_TABLE_NAME);
}
