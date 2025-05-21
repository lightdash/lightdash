import { Knex } from 'knex';

const AIAgentTableName = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(AIAgentTableName)) return;

    await knex.schema.createTable(AIAgentTableName, (table) => {
        table
            .uuid('ai_agent_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));

        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');

        table.string('name').notNullable();
        table.text('description');
        table.text('image_url');
        table.specificType('tags', 'text[]').defaultTo(null);
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AIAgentTableName))) return;
    await knex.schema.dropTable(AIAgentTableName);
}
