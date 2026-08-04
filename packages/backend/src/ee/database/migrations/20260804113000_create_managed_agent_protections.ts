import { Knex } from 'knex';

const ManagedAgentProtectionsTableName = 'managed_agent_protections';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(ManagedAgentProtectionsTableName, (table) => {
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('entity_type').notNullable();
        table.uuid('entity_uuid').notNullable();
        table.text('level').notNullable();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.primary(['project_uuid', 'entity_type', 'entity_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ManagedAgentProtectionsTableName);
}
