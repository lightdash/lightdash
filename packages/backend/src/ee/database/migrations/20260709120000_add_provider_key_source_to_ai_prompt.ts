import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';
const COLUMN_NAME = 'provider_key_source';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(AI_PROMPT_TABLE_NAME, COLUMN_NAME))) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            // 'byok' = organization's own API key, 'default' = Lightdash's key.
            // Nullable: legacy rows and responses that never reached a provider.
            table.text(COLUMN_NAME).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AI_PROMPT_TABLE_NAME, COLUMN_NAME)) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.dropColumn(COLUMN_NAME);
        });
    }
}
