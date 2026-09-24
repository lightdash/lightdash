import { Knex } from 'knex';

const AiPromptDecisionTableName = 'ai_prompt_decision';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable jsonb column to ai_prompt_decision; existing rows and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AiPromptDecisionTableName, (table) => {
            table.jsonb('correction').nullable();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AiPromptDecisionTableName, (table) => {
            table.dropColumn('correction');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
