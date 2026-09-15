import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates empty document tables without modifying existing content or permissions',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('documents', (table) => {
        table.increments('document_id').primary();
        table
            .uuid('document_uuid')
            .notNullable()
            .unique()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .integer('space_id')
            .notNullable()
            .references('space_id')
            .inTable('spaces')
            .onDelete('CASCADE')
            .index();
        table.text('slug').notNullable();
        table.text('name').notNullable();
        table.text('description').notNullable().defaultTo('');
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('deleted_at', { useTz: true }).nullable();
        table
            .uuid('deleted_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.unique(['project_uuid', 'slug']);
        table.index(['project_uuid', 'updated_at']);
    });
    await knex.schema.createTable('document_versions', (table) => {
        table.increments('document_version_id').primary();
        table
            .uuid('document_version_uuid')
            .notNullable()
            .unique()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .integer('document_id')
            .notNullable()
            .references('document_id')
            .inTable('documents')
            .onDelete('CASCADE')
            .index();
        table.integer('version_number').notNullable();
        table.integer('schema_version').notNullable();
        table.jsonb('content').notNullable();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['document_id', 'version_number']);
        table.check('version_number > 0');
        table.check('schema_version > 0');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('document_versions');
    await knex.schema.dropTable('documents');
}
