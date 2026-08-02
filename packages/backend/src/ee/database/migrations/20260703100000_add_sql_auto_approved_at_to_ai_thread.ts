import { Knex } from 'knex';

const AiThreadTableName = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        // Set when a user clicks "Approve & don't ask again" on a Slack SQL
        // approval card; subsequent runSql calls in the thread skip approval.
        table.timestamp('sql_auto_approved_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.dropColumn('sql_auto_approved_at');
    });
}
