import { Knex } from 'knex';

const AI_PROMPT_TABLE = 'ai_prompt';
const LOADOUT_BASE_COLUMN = 'loadout_base';
const LOADOUT_ADD_ONS_COLUMN = 'loadout_add_ons';

export const classification = {
    kind: 'safe',
    reason: 'Adds two nullable columns to ai_prompt recording the resolved agent loadout. Existing prompts stay NULL and older readers ignore the columns.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (
            !(await knex.schema.hasColumn(AI_PROMPT_TABLE, LOADOUT_BASE_COLUMN))
        ) {
            await knex.schema.alterTable(AI_PROMPT_TABLE, (table) => {
                table.text(LOADOUT_BASE_COLUMN).nullable();
                table.specificType(LOADOUT_ADD_ONS_COLUMN, 'text[]').nullable();
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (await knex.schema.hasColumn(AI_PROMPT_TABLE, LOADOUT_BASE_COLUMN)) {
            await knex.schema.alterTable(AI_PROMPT_TABLE, (table) => {
                table.dropColumn(LOADOUT_BASE_COLUMN);
                table.dropColumn(LOADOUT_ADD_ONS_COLUMN);
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
