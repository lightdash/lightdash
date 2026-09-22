import { Knex } from 'knex';

const tableName = 'data_app_analysis_rate_counters';

// Per viewer, app and operation minute buckets for AI analysis rate limits.
// Shared across pods; a daily sweep drops old windows.
export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(tableName)) return;
    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('app_id')
            .notNullable()
            .references('app_id')
            .inTable('apps')
            .onDelete('CASCADE');
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.text('operation').notNullable();
        table.timestamp('window_started_at', { useTz: false }).notNullable();
        table.integer('request_count').notNullable().defaultTo(0);
        // app_id is covered by the primary key prefix.
        table.primary([
            'app_id',
            'user_uuid',
            'operation',
            'window_started_at',
        ]);
        table.index(['window_started_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(tableName);
}
