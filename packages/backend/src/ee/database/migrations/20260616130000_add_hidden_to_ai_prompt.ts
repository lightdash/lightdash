import { Knex } from 'knex';

const aiPrompt = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiPrompt, (table) => {
        // Marks a prompt as a hidden turn: the agent still receives and responds
        // to it, but the UI does not render the user bubble. Used by the
        // post-merge content-migration prompt injected from the writeback PR card.
        table.boolean('hidden').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiPrompt, (table) => {
        table.dropColumn('hidden');
    });
}
