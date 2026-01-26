import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('ai_agent_user_preferences', (table) => {
        table.uuid('user_uuid').notNullable();
        table.uuid('project_uuid').notNullable();
        table.uuid('default_agent_uuid').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
        table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

        table.primary(['user_uuid', 'project_uuid']);

        table
            .foreign('user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .foreign('default_agent_uuid')
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('ai_agent_user_preferences');
}
