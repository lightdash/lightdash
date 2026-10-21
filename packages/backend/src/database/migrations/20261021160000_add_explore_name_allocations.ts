import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'This migration creates an empty table without changing existing tables or rows.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('explore_name_allocations', (table) => {
        table
            .uuid('explore_name_allocation_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.text('name').notNullable();
        table.text('source_key').notNullable();
        table.text('source_name').nullable();
        table.text('package_name').notNullable();
        table.text('model_unique_id').notNullable();
        table.text('model_name').notNullable();
        table.unique(['project_uuid', 'name']);
        table.unique([
            'project_uuid',
            'source_key',
            'package_name',
            'model_unique_id',
            'model_name',
        ]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('explore_name_allocations');
}
