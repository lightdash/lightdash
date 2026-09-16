import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two empty document access tables without reading or rewriting existing rows',
} as const;

const DOCUMENT_USER_ACCESS_TABLE = 'document_user_access';
const DOCUMENT_GROUP_ACCESS_TABLE = 'document_group_access';
const DOCUMENTS_TABLE = 'documents';
const USERS_TABLE = 'users';
const GROUPS_TABLE = 'groups';
const SPACE_ROLES = ['viewer', 'editor', 'admin'];
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(DOCUMENT_USER_ACCESS_TABLE, (table) => {
        table
            .uuid('document_uuid')
            .notNullable()
            .references('document_uuid')
            .inTable(DOCUMENTS_TABLE)
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
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.primary(['document_uuid', 'user_uuid']);
        table.index(['user_uuid', 'document_uuid']);
    });

    await knex.schema.createTable(DOCUMENT_GROUP_ACCESS_TABLE, (table) => {
        table
            .uuid('document_uuid')
            .notNullable()
            .references('document_uuid')
            .inTable(DOCUMENTS_TABLE)
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
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.primary(['document_uuid', 'group_uuid']);
        table.index(['group_uuid', 'document_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(DOCUMENT_GROUP_ACCESS_TABLE);
    await knex.schema.dropTableIfExists(DOCUMENT_USER_ACCESS_TABLE);
}
