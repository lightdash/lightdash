import { type Knex } from 'knex';

const BucketsTableName = 'api_source_rate_buckets';
const PacingTableName = 'api_source_rate_pacing';
const SlotsTableName = 'api_source_rate_slots';

// `limit_key` names what is limited (today an integration's uuid). It has no
// foreign key: the daily cleanup removes rows nobody has touched in 2 days.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.schema.createTable(BucketsTableName, (table) => {
            table.text('limit_key').notNullable();
            table.text('bucket_id').notNullable();
            table.timestamp('window_started_at', { useTz: true }).notNullable();
            table.integer('used').notNullable();
            table.timestamp('limited_until', { useTz: true }).nullable();
            table
                .timestamp('updated_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.primary(['limit_key', 'bucket_id']);
            table.index('updated_at');
        });
        await knex.schema.createTable(PacingTableName, (table) => {
            table.text('limit_key').primary();
            table.timestamp('next_call_at', { useTz: true }).notNullable();
            table
                .timestamp('updated_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.index('updated_at');
        });
        await knex.schema.createTable(SlotsTableName, (table) => {
            table.text('limit_key').notNullable();
            table.integer('slot').notNullable();
            table.uuid('lease_uuid').notNullable();
            table.timestamp('expires_at', { useTz: true }).notNullable();
            table
                .timestamp('updated_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.primary(['limit_key', 'slot']);
            table.index('updated_at');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.schema.dropTableIfExists(SlotsTableName);
        await knex.schema.dropTableIfExists(PacingTableName);
        await knex.schema.dropTableIfExists(BucketsTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
