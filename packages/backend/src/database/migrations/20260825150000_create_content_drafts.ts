import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty drafts table and adds a defaulted flag column',
} as const;

const CONTENT_DRAFTS_TABLE = 'content_drafts';
const SETTINGS_TABLE = 'content_as_code_project_settings';
const PROJECTS_TABLE = 'projects';
const USERS_TABLE = 'users';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(CONTENT_DRAFTS_TABLE, (table) => {
        table
            .uuid('content_draft_uuid')
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
        table.uuid('content_uuid').notNullable();
        table.string('slug', 255).notNullable();
        table
            .uuid('author_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('CASCADE');
        table.jsonb('draft').notNullable();
        table.string('status').notNullable().defaultTo('open');
        table.text('pr_url').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    // One open draft per author per content item
    await knex.raw(`
        CREATE UNIQUE INDEX content_drafts_open_unique
        ON ${CONTENT_DRAFTS_TABLE} (project_uuid, content_type, content_uuid, author_user_uuid)
        WHERE status = 'open'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(CONTENT_DRAFTS_TABLE);
}
