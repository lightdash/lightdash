import { Knex } from 'knex';

const AiUsageLedgerTableName = 'ai_usage_ledger';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable text column with no default to the usage ledger. Raw SQL only sets a lock timeout; existing rows and readers are unaffected.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AiUsageLedgerTableName, (table) => {
        table
            .text('usage_channel')
            .nullable()
            .comment(
                'Surface the call was made from, taken from where its thread was created. Null for calls with no thread.',
            );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AiUsageLedgerTableName, (table) => {
        table.dropColumn('usage_channel');
    });
}
