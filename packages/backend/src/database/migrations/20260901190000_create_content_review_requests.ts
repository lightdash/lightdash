import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two empty tables for content review requests and their per-project settings',
} as const;

const REQUESTS_TABLE = 'content_review_requests';
const SETTINGS_TABLE = 'content_review_settings';
const PROJECTS_TABLE = 'projects';
const SPACES_TABLE = 'spaces';
const USERS_TABLE = 'users';
const GROUPS_TABLE = 'groups';
const PENDING_UNIQUE_INDEX = 'content_review_requests_pending_unique';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(REQUESTS_TABLE, (table) => {
        table
            .uuid('content_review_request_uuid')
            .notNullable()
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE');
        table.string('content_type').notNullable();
        table.uuid('content_uuid').notNullable();
        table
            .uuid('source_space_uuid')
            .notNullable()
            .references('space_uuid')
            .inTable(SPACES_TABLE)
            .onDelete('CASCADE')
            .index();
        table
            .uuid('target_space_uuid')
            .nullable()
            .references('space_uuid')
            .inTable(SPACES_TABLE)
            .onDelete('SET NULL')
            .index();
        table
            .uuid('requested_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('CASCADE')
            .index();
        table.text('request_note').nullable();
        table.jsonb('similar_content').notNullable().defaultTo('[]');
        table.string('status').notNullable().defaultTo('pending');
        table
            .uuid('reviewed_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL')
            .index();
        table.timestamp('reviewed_at', { useTz: true }).nullable();
        table.text('review_note').nullable();
        table.boolean('verified_on_approve').nullable();
        table.jsonb('moved_content').notNullable().defaultTo('[]');
        table.jsonb('granted_principals').notNullable().defaultTo('[]');
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['project_uuid', 'status']);
        table.index(['content_type', 'content_uuid']);
    });

    await knex.raw(`
        ALTER TABLE ${REQUESTS_TABLE}
        ADD CONSTRAINT content_review_requests_content_type_check
        CHECK (content_type IN ('chart', 'dashboard', 'sql_chart'))
    `);
    await knex.raw(`
        ALTER TABLE ${REQUESTS_TABLE}
        ADD CONSTRAINT content_review_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
    `);

    // One open request per content item
    await knex.raw(`
        CREATE UNIQUE INDEX ${PENDING_UNIQUE_INDEX}
        ON ${REQUESTS_TABLE} (content_type, content_uuid)
        WHERE status = 'pending'
    `);

    await knex.schema.createTable(SETTINGS_TABLE, (table) => {
        table
            .uuid('project_uuid')
            .notNullable()
            .primary()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE');
        table
            .uuid('reviewer_group_uuid')
            .nullable()
            .references('group_uuid')
            .inTable(GROUPS_TABLE)
            .onDelete('SET NULL')
            .index();
        table
            .boolean('verify_on_approve_default')
            .notNullable()
            .defaultTo(true);
        table.text('slack_channel_id').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(SETTINGS_TABLE);
    await knex.schema.dropTableIfExists(REQUESTS_TABLE);
}
