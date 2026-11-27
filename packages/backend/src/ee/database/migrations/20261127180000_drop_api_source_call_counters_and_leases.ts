import { type Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';
const CallCountersTableName = 'api_source_call_counters';
const CallLeasesTableName = 'api_source_call_leases';

// The rate limiter moved to api_source_rate_buckets, _pacing and _slots in
// 3.375.0. Nothing writes these tables since; only a daily cleanup still
// deleted from them.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.schema.dropTableIfExists(CallLeasesTableName);
    await knex.schema.dropTableIfExists(CallCountersTableName);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.schema.createTable(CallCountersTableName, (table) => {
        table
            .uuid('external_connection_uuid')
            .notNullable()
            .references('external_connection_uuid')
            .inTable(ExternalConnectionsTableName)
            .onDelete('CASCADE')
            .index();
        table.integer('window_seconds').notNullable();
        table.timestamp('window_started_at', { useTz: false }).notNullable();
        table.integer('call_count').notNullable().defaultTo(0);
        table.primary([
            'external_connection_uuid',
            'window_seconds',
            'window_started_at',
        ]);
    });
    await knex.schema.createTable(CallLeasesTableName, (table) => {
        table
            .uuid('external_connection_uuid')
            .notNullable()
            .references('external_connection_uuid')
            .inTable(ExternalConnectionsTableName)
            .onDelete('CASCADE')
            .index();
        table.integer('slot').notNullable();
        table.uuid('lease_uuid').notNullable();
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.primary(['external_connection_uuid', 'slot']);
    });
}
