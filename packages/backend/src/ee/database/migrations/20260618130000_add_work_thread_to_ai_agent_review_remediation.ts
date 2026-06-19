import { Knex } from 'knex';

const remediationTable = 'ai_agent_review_remediation';
const aiThreadTable = 'ai_thread';
const workThreadColumn = 'work_thread_uuid';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(remediationTable, (table) => {
        table
            .uuid(workThreadColumn)
            .nullable()
            .references('ai_thread_uuid')
            .inTable(aiThreadTable)
            .onDelete('SET NULL');
        table.index([workThreadColumn]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(remediationTable, (table) => {
        table.dropColumn(workThreadColumn);
    });
}
