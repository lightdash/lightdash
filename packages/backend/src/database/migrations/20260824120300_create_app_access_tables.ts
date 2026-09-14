import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two empty app access tables without reading or rewriting existing rows',
} as const;

const APP_USER_ACCESS_TABLE = 'app_user_access';
const APP_GROUP_ACCESS_TABLE = 'app_group_access';
const APPS_TABLE = 'apps';
const USERS_TABLE = 'users';
const GROUPS_TABLE = 'groups';
const SPACE_ROLES = ['viewer', 'editor', 'admin'];
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(APP_USER_ACCESS_TABLE, (table) => {
        table
            .uuid('app_uuid')
            .notNullable()
            .references('app_id')
            .inTable(APPS_TABLE)
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

        table.primary(['app_uuid', 'user_uuid']);
        table.index(['user_uuid', 'app_uuid']);
    });

    await knex.schema.createTable(APP_GROUP_ACCESS_TABLE, (table) => {
        table
            .uuid('app_uuid')
            .notNullable()
            .references('app_id')
            .inTable(APPS_TABLE)
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

        table.primary(['app_uuid', 'group_uuid']);
        table.index(['group_uuid', 'app_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(APP_GROUP_ACCESS_TABLE);
    await knex.schema.dropTableIfExists(APP_USER_ACCESS_TABLE);
}
