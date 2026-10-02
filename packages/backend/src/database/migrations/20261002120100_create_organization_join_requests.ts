import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new table for requests to join an organization without touching existing rows',
} as const;

const TABLE = 'organization_join_requests';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.createTable(TABLE, (table) => {
        table.uuid('join_request_uuid').primary();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.text('status').notNullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('decided_at', { useTz: true }).nullable();
        table
            .uuid('decided_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
    });
    await knex.raw(
        `ALTER TABLE ${TABLE} ADD CONSTRAINT organization_join_requests_status_check CHECK (status IN ('pending', 'approved', 'declined', 'expired'))`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX organization_join_requests_one_pending ON ${TABLE} (organization_uuid, user_uuid) WHERE status = 'pending'`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.dropTable(TABLE);
}
