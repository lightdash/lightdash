import { Knex } from 'knex';

const EXTERNAL_CONNECTIONS = 'external_connections';
const EXTERNAL_CONNECTION_SECRETS = 'external_connection_secrets';
const APP_EXTERNAL_CONNECTIONS = 'app_external_connections';
const EXTERNAL_CONNECTION_RATE_COUNTERS = 'external_connection_rate_counters';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(EXTERNAL_CONNECTIONS))) {
        await knex.schema.createTable(EXTERNAL_CONNECTIONS, (table) => {
            table
                .uuid('external_connection_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();

            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();

            table.text('name').notNullable();
            table.text('type').notNullable();
            table.text('origin').notNullable();

            table.jsonb('allowed_path_prefixes').notNullable().defaultTo('[]');
            table
                .jsonb('allowed_methods')
                .notNullable()
                .defaultTo(JSON.stringify(['GET']));
            table.jsonb('allowed_content_types').notNullable().defaultTo('[]');

            table
                .integer('response_max_bytes')
                .notNullable()
                .defaultTo(1048576);
            table.integer('request_max_bytes').notNullable().defaultTo(262144);
            table.integer('timeout_ms').notNullable().defaultTo(10000);
            table.integer('rate_limit_per_minute').nullable();

            table.text('api_key_name').nullable();
            table.text('api_key_location').nullable();

            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table
                .uuid('updated_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
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
            table.timestamp('deleted_at', { useTz: false }).nullable();
        });
    }

    if (!(await knex.schema.hasTable(EXTERNAL_CONNECTION_SECRETS))) {
        await knex.schema.createTable(EXTERNAL_CONNECTION_SECRETS, (table) => {
            table
                .uuid('external_connection_uuid')
                .primary()
                .references('external_connection_uuid')
                .inTable(EXTERNAL_CONNECTIONS)
                .onDelete('CASCADE');

            table.binary('encrypted_payload').notNullable();

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.timestamp('rotated_at', { useTz: false }).nullable();
        });
    }

    if (!(await knex.schema.hasTable(APP_EXTERNAL_CONNECTIONS))) {
        await knex.schema.createTable(APP_EXTERNAL_CONNECTIONS, (table) => {
            table
                .uuid('app_id')
                .notNullable()
                .references('app_id')
                .inTable('apps')
                .onDelete('CASCADE')
                .index();

            table
                .uuid('external_connection_uuid')
                .notNullable()
                .references('external_connection_uuid')
                .inTable(EXTERNAL_CONNECTIONS)
                .onDelete('CASCADE')
                .index();

            table.text('alias').notNullable();

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table.unique(['app_id', 'alias']);
        });
    }

    if (!(await knex.schema.hasTable(EXTERNAL_CONNECTION_RATE_COUNTERS))) {
        await knex.schema.createTable(
            EXTERNAL_CONNECTION_RATE_COUNTERS,
            (table) => {
                table
                    .uuid('external_connection_uuid')
                    .notNullable()
                    .references('external_connection_uuid')
                    .inTable(EXTERNAL_CONNECTIONS)
                    .onDelete('CASCADE')
                    .index();

                table
                    .uuid('app_id')
                    .notNullable()
                    .references('app_id')
                    .inTable('apps')
                    .onDelete('CASCADE')
                    .index();

                table
                    .timestamp('window_started_at', { useTz: false })
                    .notNullable();
                table.integer('request_count').notNullable().defaultTo(0);

                table.primary([
                    'external_connection_uuid',
                    'app_id',
                    'window_started_at',
                ]);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(EXTERNAL_CONNECTION_RATE_COUNTERS)) {
        await knex.schema.dropTable(EXTERNAL_CONNECTION_RATE_COUNTERS);
    }
    if (await knex.schema.hasTable(APP_EXTERNAL_CONNECTIONS)) {
        await knex.schema.dropTable(APP_EXTERNAL_CONNECTIONS);
    }
    if (await knex.schema.hasTable(EXTERNAL_CONNECTION_SECRETS)) {
        await knex.schema.dropTable(EXTERNAL_CONNECTION_SECRETS);
    }
    if (await knex.schema.hasTable(EXTERNAL_CONNECTIONS)) {
        await knex.schema.dropTable(EXTERNAL_CONNECTIONS);
    }
}
