import { Knex } from 'knex';

const AI_ORG_SETTINGS_TABLE = 'ai_organization_settings';
const AI_AGENT_TABLE = 'ai_agent';
const COLUMN = 'thread_retention_hours';
const MIN_HOURS = 1;
const MAX_HOURS = 876000;

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable integer columns with CHECK constraints to two small tables (one row per org / per agent); no backfill, no reads affected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            table.integer(COLUMN).nullable();
        });
        await knex.raw(
            `ALTER TABLE ${AI_ORG_SETTINGS_TABLE} ADD CONSTRAINT ${AI_ORG_SETTINGS_TABLE}_${COLUMN}_range CHECK (${COLUMN} IS NULL OR (${COLUMN} >= ${MIN_HOURS} AND ${COLUMN} <= ${MAX_HOURS}))`,
        );

        await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
            table.integer(COLUMN).nullable();
        });
        await knex.raw(
            `ALTER TABLE ${AI_AGENT_TABLE} ADD CONSTRAINT ${AI_AGENT_TABLE}_${COLUMN}_range CHECK (${COLUMN} IS NULL OR (${COLUMN} >= ${MIN_HOURS} AND ${COLUMN} <= ${MAX_HOURS}))`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
