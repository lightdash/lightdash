import { Knex } from 'knex';

const AiUsageLedgerTableName = 'ai_usage_ledger';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty ledger table. Raw SQL only sets a lock timeout and generates UUID defaults; existing tables and data are unchanged.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(AiUsageLedgerTableName, (table) => {
        table
            .uuid('ai_usage_ledger_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('event_id')
            .notNullable()
            .unique()
            .comment(
                'Id shared with the analytics event and the usage stream so the three copies reconcile.',
            );
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.text('project_uuid').nullable();
        table.text('user_uuid').nullable();
        table.text('agent_uuid').nullable();
        table.text('thread_uuid').nullable();
        table.text('prompt_uuid').nullable();
        table.text('app_uuid').nullable();
        table.text('feature').notNullable();
        table.text('function_id').notNullable();
        table.text('model').nullable();
        table.text('provider').nullable();
        table
            .text('key_management')
            .nullable()
            .comment(
                'Who paid for the key: lightdash-managed rows are billable, self-managed rows are the customer own key.',
            );
        table.text('outcome').notNullable();
        table.bigInteger('input_tokens').nullable();
        table.bigInteger('output_tokens').nullable();
        table.bigInteger('cache_read_tokens').nullable();
        table.bigInteger('cache_write_tokens').nullable();
        table.bigInteger('reasoning_tokens').nullable();
        table.bigInteger('total_tokens').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.index(['organization_uuid', 'created_at']);
        table.index(['created_at']);
        table.index(['thread_uuid'], 'ai_usage_ledger_thread_uuid_index', {
            predicate: knex.whereNotNull('thread_uuid'),
        });
        table.index(['app_uuid'], 'ai_usage_ledger_app_uuid_index', {
            predicate: knex.whereNotNull('app_uuid'),
        });
        table.check(
            `key_management IS NULL OR key_management IN ('lightdash-managed', 'self-managed')`,
            [],
            'ai_usage_ledger_key_management_check',
        );
        table.check(
            `outcome IN ('complete', 'failed')`,
            [],
            'ai_usage_ledger_outcome_check',
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiUsageLedgerTableName);
}
