import { Knex } from 'knex';

const TABLE = 'ai_organization_settings';
const COLUMN = 'max_query_limit';
const MIN = 1;
const MAX = 100000;

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable integer column with a CHECK constraint to a one-row-per-org table; no backfill, no reads affected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(TABLE, (table) => {
            table.integer(COLUMN).nullable();
        });
        await knex.raw(
            `ALTER TABLE ${TABLE} ADD CONSTRAINT ${TABLE}_${COLUMN}_range CHECK (${COLUMN} IS NULL OR (${COLUMN} >= ${MIN} AND ${COLUMN} <= ${MAX}))`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
