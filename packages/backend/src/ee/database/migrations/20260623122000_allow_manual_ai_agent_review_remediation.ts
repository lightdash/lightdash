import { Knex } from 'knex';

const remediationTable = 'ai_agent_review_remediation';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(remediationTable, (table) => {
        table
            .uuid('source_ai_agent_review_turn_signal_uuid')
            .nullable()
            .alter();
        table.uuid('source_prompt_uuid').nullable().alter();
        table.uuid('source_thread_uuid').nullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(remediationTable, (table) => {
        table
            .uuid('source_ai_agent_review_turn_signal_uuid')
            .notNullable()
            .alter();
        table.uuid('source_prompt_uuid').notNullable().alter();
        table.uuid('source_thread_uuid').notNullable().alter();
    });
}
