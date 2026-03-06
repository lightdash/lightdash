import { Knex } from 'knex';

const TABLE_NAME = 'content_verification';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(TABLE_NAME, (table) => {
        table
            .uuid('content_verification_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('content_type').notNullable();
        table.uuid('content_uuid').notNullable();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('verified_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .timestamp('verified_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['content_type', 'content_uuid']);
        table.index(['project_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(TABLE_NAME);
}
