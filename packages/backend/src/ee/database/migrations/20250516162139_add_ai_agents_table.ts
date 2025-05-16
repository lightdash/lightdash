import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('ai_agent')) return;

    await knex.schema.createTable('ai_agent', (table) => {
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
        table.jsonb('data_sources').defaultTo({ fieldNameTags: null });
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        // Indexes
        table.index(
            ['project_uuid', 'organization_uuid'],
            'idx_ai_agent_project_org',
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('ai_agent'))) return;
    await knex.schema.dropTable('ai_agent');
}
