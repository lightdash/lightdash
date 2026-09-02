import { Knex } from 'knex';

const EXTERNAL_SOURCES_TABLE = 'external_sources';
const EXTERNAL_SOURCE_TABLES_TABLE = 'external_source_tables';
const PROJECTS_TABLE = 'projects';
const USERS_TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(EXTERNAL_SOURCES_TABLE, (table) => {
        table
            .uuid('external_source_uuid')
            .notNullable()
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));

        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE')
            .index();

        table.string('type').notNullable();
        table.string('name').notNullable();
        table.string('status').notNullable().defaultTo('staged');
        table.text('error_message').nullable();
        table.jsonb('connection').notNullable();

        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL')
            .index();

        table.string('refresh_cron').nullable();
        table.timestamp('last_refreshed_at', { useTz: false }).nullable();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['project_uuid', 'name']);
    });

    await knex.schema.createTable(EXTERNAL_SOURCE_TABLES_TABLE, (table) => {
        table
            .uuid('external_source_table_uuid')
            .notNullable()
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));

        table
            .uuid('external_source_uuid')
            .notNullable()
            .references('external_source_uuid')
            .inTable(EXTERNAL_SOURCES_TABLE)
            .onDelete('CASCADE')
            .index();

        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE')
            .index();

        table.string('name').notNullable();
        table.string('label').notNullable();
        table.jsonb('columns').nullable();
        table.jsonb('locator').nullable();
        table.integer('row_count').nullable();
        table.bigInteger('total_bytes').nullable();
        table.integer('version').notNullable().defaultTo(0);
        table.timestamp('last_ingested_at', { useTz: false }).nullable();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['project_uuid', 'name']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(EXTERNAL_SOURCE_TABLES_TABLE);
    await knex.schema.dropTableIfExists(EXTERNAL_SOURCES_TABLE);
}
