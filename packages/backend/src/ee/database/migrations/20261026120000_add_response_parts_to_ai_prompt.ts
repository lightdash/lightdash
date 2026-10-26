import { Knex } from 'knex';

const AI_PROMPT_TABLE = 'ai_prompt';
const RESPONSE_PARTS_COLUMN = 'response_parts';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable jsonb column to ai_prompt recording the ordered response text and tool calls. Existing prompts stay NULL and older readers ignore the column.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (
            !(await knex.schema.hasColumn(
                AI_PROMPT_TABLE,
                RESPONSE_PARTS_COLUMN,
            ))
        ) {
            await knex.schema.alterTable(AI_PROMPT_TABLE, (table) => {
                table.jsonb(RESPONSE_PARTS_COLUMN).nullable();
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
            await knex.schema.hasColumn(AI_PROMPT_TABLE, RESPONSE_PARTS_COLUMN)
        ) {
            await knex.schema.alterTable(AI_PROMPT_TABLE, (table) => {
                table.dropColumn(RESPONSE_PARTS_COLUMN);
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
