import { Knex } from 'knex';

const TableName = 'release_highlights';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty release highlights cache table without changing existing tables or readers.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.createTable(TableName, (table) => {
            table.text('from_version').notNullable();
            table.text('to_version').notNullable();
            table.jsonb('candidates').notNullable();
            table.jsonb('ranked').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.primary(['from_version', 'to_version']);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(TableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
