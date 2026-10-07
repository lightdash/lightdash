import { Knex } from 'knex';

const turnSignalTable = 'ai_agent_review_turn_signal';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(turnSignalTable, (table) => {
        // Draft skill the judge emits for a create_skill recommendation;
        // prefills the skill editor from the Issues board.
        table.jsonb('skill_proposal').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(turnSignalTable, (table) => {
        table.dropColumn('skill_proposal');
    });
}
