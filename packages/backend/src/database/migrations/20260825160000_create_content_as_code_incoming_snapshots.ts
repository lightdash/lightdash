import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty incoming-stash table without touching existing rows',
} as const;

const CONTENT_AS_CODE_INCOMING_SNAPSHOTS_TABLE =
    'content_as_code_incoming_snapshots';
const PROJECTS_TABLE = 'projects';
const USERS_TABLE = 'users';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(
        CONTENT_AS_CODE_INCOMING_SNAPSHOTS_TABLE,
        (table) => {
            table
                .uuid('content_as_code_incoming_snapshot_uuid')
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
            table.jsonb('incoming_snapshot').notNullable();
            table.string('incoming_snapshot_hash', 64).notNullable();
            table
                .timestamp('stashed_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('stashed_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable(USERS_TABLE)
                .onDelete('SET NULL')
                .index();

            table.unique(['project_uuid', 'content_type', 'slug']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.dropTableIfExists(
        CONTENT_AS_CODE_INCOMING_SNAPSHOTS_TABLE,
    );
}
