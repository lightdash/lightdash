import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty stash table without touching existing rows',
} as const;

const INCOMING_STASH_TABLE = 'content_as_code_incoming_stash';
const PROJECTS_TABLE = 'projects';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.createTable(INCOMING_STASH_TABLE, (table) => {
        table
            .uuid('content_as_code_incoming_stash_uuid')
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
        table.string('incoming_hash', 64).notNullable();
        table
            .timestamp('rejected_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['project_uuid', 'content_type', 'slug']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.dropTableIfExists(INCOMING_STASH_TABLE);
}
