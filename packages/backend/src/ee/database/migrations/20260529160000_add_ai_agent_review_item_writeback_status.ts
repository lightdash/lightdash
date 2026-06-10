import { Knex } from 'knex';

const reviewItemTable = 'ai_agent_review_item';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(reviewItemTable, (table) => {
        table
            .text('pr_writeback_status')
            .nullable()
            .checkIn(['queued', 'running', 'completed', 'failed']);
        table.text('pr_writeback_message').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(reviewItemTable, (table) => {
        table.dropColumn('pr_writeback_status');
        table.dropColumn('pr_writeback_message');
    });
}
