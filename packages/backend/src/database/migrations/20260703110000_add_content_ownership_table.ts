import { Knex } from 'knex';

const TABLE_NAME = 'content_ownership';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(TABLE_NAME, (table) => {
        table
            .uuid('content_ownership_uuid')
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
            .uuid('owner_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('owner_group_uuid')
            .nullable()
            .references('group_uuid')
            .inTable('groups')
            .onDelete('CASCADE');
        table
            .uuid('assigned_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table
            .timestamp('assigned_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['content_type', 'content_uuid']);
        table.index(['project_uuid']);
        table.index(['owner_user_uuid']);
        table.index(['owner_group_uuid']);
    });

    await knex.raw(`
        ALTER TABLE ${TABLE_NAME}
        ADD CONSTRAINT content_ownership_exactly_one_owner
        CHECK (
            (owner_user_uuid IS NOT NULL AND owner_group_uuid IS NULL) OR
            (owner_user_uuid IS NULL AND owner_group_uuid IS NOT NULL)
        )
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(TABLE_NAME);
}
