import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';
const ENABLE_COMPOSER_QUERIES_COLUMN = 'enable_composer_queries';

export const classification = {
    kind: 'safe',
    reason: 'Adds one boolean column to ai_agent defaulting to false. Existing agents keep the classic query tools until an admin opts in to composer queries.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (
            !(await knex.schema.hasColumn(
                AI_AGENT_TABLE,
                ENABLE_COMPOSER_QUERIES_COLUMN,
            ))
        ) {
            await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
                table
                    .boolean(ENABLE_COMPOSER_QUERIES_COLUMN)
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
                ENABLE_COMPOSER_QUERIES_COLUMN,
            )
        ) {
            await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
                table.dropColumn(ENABLE_COMPOSER_QUERIES_COLUMN);
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
