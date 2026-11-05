import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'This migration creates a new table. It does not change existing rows or columns.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('dbt_source_ref_catalogs', (table) => {
        table
            .uuid('dbt_source_ref_catalog_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.uuid('dbt_source_uuid').notNullable();
        table.text('connection_group').notNullable();
        table.text('project_name').notNullable();
        table.text('dbt_version').notNullable();
        table
            .text('status')
            .notNullable()
            .checkIn(['provisional', 'confirmed']);
        table.jsonb('nodes').notNullable();
        table.jsonb('referenced_projects').notNullable().defaultTo('[]');
        table.text('nodes_digest').notNullable();
        table.text('compile_job_uuid').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'dbt_source_uuid', 'connection_group']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('dbt_source_ref_catalogs');
}
