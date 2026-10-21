import { Knex } from 'knex';

const APP_USER_STATE = 'app_user_state';
const APP_SHARED_STATE = 'app_shared_state';
const APP_SHARED_STATE_HISTORY = 'app_shared_state_history';

export const classification = {
    kind: 'safe',
    reason: 'Creates three empty app state tables; the raw statements only set and reset lock_timeout around the DDL and touch no existing table or reader.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.createTable(APP_USER_STATE, (table) => {
            table
                .uuid('app_user_state_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            // Leading column of the unique index below, so no separate index.
            table
                .uuid('app_uuid')
                .notNullable()
                .references('app_id')
                .inTable('apps')
                .onDelete('CASCADE');
            table
                .uuid('user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE')
                .index();
            table.text('key').notNullable();
            table.jsonb('value').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['app_uuid', 'user_uuid', 'key'], {
                indexName: 'app_user_state_app_user_key_unique',
            });
        });

        await knex.schema.createTable(APP_SHARED_STATE, (table) => {
            table
                .uuid('app_shared_state_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            // Leading column of the unique index below, so no separate index.
            table
                .uuid('app_uuid')
                .notNullable()
                .references('app_id')
                .inTable('apps')
                .onDelete('CASCADE');
            table.text('key').notNullable();
            table.jsonb('value').notNullable();
            table.integer('version').notNullable();
            table
                .uuid('updated_by_user_uuid')
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
            table.unique(['app_uuid', 'key'], {
                indexName: 'app_shared_state_app_key_unique',
            });
        });

        await knex.schema.createTable(APP_SHARED_STATE_HISTORY, (table) => {
            table
                .uuid('app_shared_state_history_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            // Leading column of the unique index below, so no separate index.
            table
                .uuid('app_uuid')
                .notNullable()
                .references('app_id')
                .inTable('apps')
                .onDelete('CASCADE');
            table.text('key').notNullable();
            table.integer('version').notNullable();
            table.jsonb('value').notNullable();
            // 'user' | 'agent'. Agent authors are reserved for server-side writers.
            table.text('author_kind').notNullable();
            table
                .uuid('author_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['app_uuid', 'key', 'version'], {
                indexName: 'app_shared_state_history_app_key_version_unique',
            });
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(APP_SHARED_STATE_HISTORY);
        await knex.schema.dropTableIfExists(APP_SHARED_STATE);
        await knex.schema.dropTableIfExists(APP_USER_STATE);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
