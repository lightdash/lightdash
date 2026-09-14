import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two empty dashboard access tables without reading or rewriting existing rows',
} as const;

const DASHBOARD_USER_ACCESS_TABLE = 'dashboard_user_access';
const DASHBOARD_GROUP_ACCESS_TABLE = 'dashboard_group_access';
const DASHBOARDS_TABLE = 'dashboards';
const USERS_TABLE = 'users';
const GROUPS_TABLE = 'groups';
const SPACE_ROLES = ['viewer', 'editor', 'admin'];
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(DASHBOARD_USER_ACCESS_TABLE, (table) => {
        table
            .uuid('dashboard_uuid')
            .notNullable()
            .references('dashboard_uuid')
            .inTable(DASHBOARDS_TABLE)
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

        table.primary(['dashboard_uuid', 'user_uuid']);
        table.index(['user_uuid', 'dashboard_uuid']);
    });

    await knex.schema.createTable(DASHBOARD_GROUP_ACCESS_TABLE, (table) => {
        table
            .uuid('dashboard_uuid')
            .notNullable()
            .references('dashboard_uuid')
            .inTable(DASHBOARDS_TABLE)
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

        table.primary(['dashboard_uuid', 'group_uuid']);
        table.index(['group_uuid', 'dashboard_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(DASHBOARD_GROUP_ACCESS_TABLE);
    await knex.schema.dropTableIfExists(DASHBOARD_USER_ACCESS_TABLE);
}
