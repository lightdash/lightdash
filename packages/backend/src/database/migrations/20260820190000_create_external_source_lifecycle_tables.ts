import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates empty lifecycle bookkeeping tables without rewriting existing rows',
} as const;

const EXTERNAL_SOURCES_TABLE = 'external_sources';
const EXTERNAL_SOURCE_TABLES_TABLE = 'external_source_tables';
const EXTERNAL_SOURCE_CREDENTIALS_TABLE = 'external_source_credentials';
const EXTERNAL_SOURCE_INGEST_ATTEMPTS_TABLE = 'external_source_ingest_attempts';
const EXTERNAL_SOURCE_OBJECTS_TABLE = 'external_source_objects';
const PROJECTS_TABLE = 'projects';
const ORGANIZATIONS_TABLE = 'organizations';
const USERS_TABLE = 'users';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(
        EXTERNAL_SOURCE_CREDENTIALS_TABLE,
        (table) => {
            table
                .uuid('external_source_uuid')
                .notNullable()
                .primary()
                .references('external_source_uuid')
                .inTable(EXTERNAL_SOURCES_TABLE)
                .onDelete('CASCADE');
            table.string('provider').notNullable();
            table.binary('encrypted_refresh_token').notNullable();
            table
                .uuid('connected_by_user_uuid')
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
        },
    );

    await knex.schema.createTable(
        EXTERNAL_SOURCE_INGEST_ATTEMPTS_TABLE,
        (table) => {
            table
                .uuid('external_source_ingest_attempt_uuid')
                .notNullable()
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable(ORGANIZATIONS_TABLE)
                .onDelete('CASCADE')
                .index();
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable(PROJECTS_TABLE)
                .onDelete('CASCADE')
                .index();
            table
                .uuid('external_source_uuid')
                .notNullable()
                .references('external_source_uuid')
                .inTable(EXTERNAL_SOURCES_TABLE)
                .onDelete('CASCADE')
                .index();
            table
                .uuid('external_source_table_uuid')
                .notNullable()
                .references('external_source_table_uuid')
                .inTable(EXTERNAL_SOURCE_TABLES_TABLE)
                .onDelete('CASCADE')
                .index();
            table
                .uuid('requested_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable(USERS_TABLE)
                .onDelete('SET NULL')
                .index();
            table.integer('target_version').notNullable();
            table.string('status').notNullable().defaultTo('queued');
            table.uuid('execution_uuid').nullable();
            table.timestamp('lease_expires_at', { useTz: false }).nullable();
            table.integer('run_count').notNullable().defaultTo(0);
            table.jsonb('columns').nullable();
            table.jsonb('locator').nullable();
            table.bigInteger('row_count').nullable();
            table.bigInteger('total_bytes').nullable();
            table.text('error_message').nullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.timestamp('finished_at', { useTz: false }).nullable();

            table.unique(['external_source_table_uuid', 'target_version']);
            table.index(['organization_uuid', 'status', 'lease_expires_at']);
        },
    );

    await knex.schema.createTable(EXTERNAL_SOURCE_OBJECTS_TABLE, (table) => {
        table
            .uuid('external_source_object_uuid')
            .notNullable()
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        // Deliberately no source/project/org FKs: manifests must survive
        // cascaded domain deletion until the storage object is collected.
        table.uuid('organization_uuid').notNullable().index();
        table.uuid('project_uuid').notNullable().index();
        table.uuid('external_source_uuid').notNullable().index();
        table
            .uuid('external_source_ingest_attempt_uuid')
            .nullable()
            .references('external_source_ingest_attempt_uuid')
            .inTable(EXTERNAL_SOURCE_INGEST_ATTEMPTS_TABLE)
            .onDelete('SET NULL')
            .index();
        table.string('object_key').notNullable().unique();
        table.string('purpose').notNullable();
        table.string('status').notNullable().defaultTo('uploading');
        table.bigInteger('size_bytes').nullable();
        table.timestamp('delete_after', { useTz: false }).nullable().index();
        table.integer('delete_attempts').notNullable().defaultTo(0);
        table.text('last_error').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(EXTERNAL_SOURCE_OBJECTS_TABLE);
    await knex.schema.dropTableIfExists(EXTERNAL_SOURCE_INGEST_ATTEMPTS_TABLE);
    await knex.schema.dropTableIfExists(EXTERNAL_SOURCE_CREDENTIALS_TABLE);
}
