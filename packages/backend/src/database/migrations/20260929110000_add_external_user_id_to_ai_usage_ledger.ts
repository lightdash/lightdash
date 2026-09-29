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
            .text('external_user_id')
            .nullable()
            .comment(
                'Viewer id the host application put in the embed token, stored as sent without the external:: prefix. Null outside embedded agent chats, where user_uuid identifies the caller.',
            );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AiUsageLedgerTableName, (table) => {
        table.dropColumn('external_user_id');
    });
}
