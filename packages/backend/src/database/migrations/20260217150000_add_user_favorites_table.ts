import { Knex } from 'knex';

const UserFavoritesTableName = 'user_favorites';
const UsersTableName = 'users';
const ProjectsTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(UserFavoritesTableName, (table) => {
        table
            .uuid('user_favorite_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable(UsersTableName)
            .onDelete('CASCADE');
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(ProjectsTableName)
            .onDelete('CASCADE');
        table.text('content_type').notNullable();
        table.uuid('content_uuid').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['user_uuid', 'content_type', 'content_uuid']);
        table.index(['user_uuid', 'project_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(UserFavoritesTableName);
}
