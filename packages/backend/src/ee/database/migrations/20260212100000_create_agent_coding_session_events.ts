import { Knex } from 'knex';

const SESSIONS_TABLE = 'agent_coding_sessions';
const EVENTS_TABLE = 'agent_coding_session_events';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(EVENTS_TABLE))) {
        await knex.schema.createTable(EVENTS_TABLE, (table) => {
            table.increments('event_id').primary();
            table
                .uuid('session_uuid')
                .notNullable()
                .references('session_uuid')
                .inTable(SESSIONS_TABLE)
                .onDelete('CASCADE');
            table.string('event_type').notNullable();
            table.jsonb('payload').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            // Index for streaming queries (fetch events since event_id N)
            table.index(['session_uuid', 'event_id']);

            // Index for pruning old events by timestamp
            table.index('created_at');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(EVENTS_TABLE);
}
