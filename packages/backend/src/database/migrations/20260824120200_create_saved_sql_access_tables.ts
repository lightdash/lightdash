import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two empty saved SQL access tables without reading or rewriting existing rows',
} as const;

const SAVED_SQL_USER_ACCESS_TABLE = 'saved_sql_user_access';
const SAVED_SQL_GROUP_ACCESS_TABLE = 'saved_sql_group_access';
const SAVED_SQL_TABLE = 'saved_sql';
const USERS_TABLE = 'users';
const GROUPS_TABLE = 'groups';
const SPACE_ROLES = ['viewer', 'editor', 'admin'];
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(SAVED_SQL_USER_ACCESS_TABLE, (table) => {
        table
            .uuid('saved_sql_uuid')
            .notNullable()
            .references('saved_sql_uuid')
            .inTable(SAVED_SQL_TABLE)
            .onDelete('CASCADE');
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('CASCADE');
        table.text('space_role').notNullable().checkIn(SPACE_ROLES);
        table
            .uuid('granted_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.primary(['saved_sql_uuid', 'user_uuid']);
        table.index(['user_uuid', 'saved_sql_uuid']);
    });

    await knex.schema.createTable(SAVED_SQL_GROUP_ACCESS_TABLE, (table) => {
        table
            .uuid('saved_sql_uuid')
            .notNullable()
            .references('saved_sql_uuid')
            .inTable(SAVED_SQL_TABLE)
            .onDelete('CASCADE');
        table
            .uuid('group_uuid')
            .notNullable()
            .references('group_uuid')
            .inTable(GROUPS_TABLE)
            .onDelete('CASCADE');
        table.text('space_role').notNullable().checkIn(SPACE_ROLES);
        table
            .uuid('granted_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.primary(['saved_sql_uuid', 'group_uuid']);
        table.index(['group_uuid', 'saved_sql_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(SAVED_SQL_GROUP_ACCESS_TABLE);
    await knex.schema.dropTableIfExists(SAVED_SQL_USER_ACCESS_TABLE);
}
