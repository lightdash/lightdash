import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';
const ENABLE_SQL_AUTO_APPROVAL_COLUMN = 'enable_sql_auto_approval';

export const classification = {
    kind: 'safe',
    reason: 'Adds one boolean column to ai_agent defaulting to false. Existing agents keep asking for SQL approval exactly as before until an admin opts in.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (
            !(await knex.schema.hasColumn(
                AI_AGENT_TABLE,
                ENABLE_SQL_AUTO_APPROVAL_COLUMN,
            ))
        ) {
            await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
                table
                    .boolean(ENABLE_SQL_AUTO_APPROVAL_COLUMN)
                    .notNullable()
                    .defaultTo(false);
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (
            await knex.schema.hasColumn(
                AI_AGENT_TABLE,
                ENABLE_SQL_AUTO_APPROVAL_COLUMN,
            )
        ) {
            await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
                table.dropColumn(ENABLE_SQL_AUTO_APPROVAL_COLUMN);
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
