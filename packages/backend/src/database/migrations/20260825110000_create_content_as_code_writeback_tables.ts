import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two empty bookkeeping tables without touching existing rows',
} as const;

const PROJECT_SETTINGS_TABLE = 'content_as_code_project_settings';
const WRITEBACKS_TABLE = 'content_as_code_writebacks';
const PROJECTS_TABLE = 'projects';
const USERS_TABLE = 'users';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(PROJECT_SETTINGS_TABLE, (table) => {
        table
            .uuid('project_uuid')
            .notNullable()
            .primary()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE');
        table.boolean('sync_enabled').notNullable().defaultTo(false);
        table
            .timestamp('stamped_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(WRITEBACKS_TABLE, (table) => {
        table
            .uuid('content_as_code_writeback_uuid')
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
        table.string('content_type').notNullable();
        table.string('slug', 255).notNullable();
        table.string('branch').notNullable();
        table.integer('pr_number').nullable();
        table.text('pr_url').nullable();
        table.string('status').notNullable().defaultTo('pending');
        table.text('error').nullable();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    // One live write-back PR per slug per instance
    await knex.raw(`
        CREATE UNIQUE INDEX content_as_code_writebacks_live_unique
        ON ${WRITEBACKS_TABLE} (project_uuid, content_type, slug)
        WHERE status IN ('pending', 'open')
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(WRITEBACKS_TABLE);
    await knex.schema.dropTableIfExists(PROJECT_SETTINGS_TABLE);
}
