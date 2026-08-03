import { type Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';
const AiDeepResearchAnalyticsOutboxTableName =
    'ai_deep_research_analytics_outbox';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        AiDeepResearchAnalyticsOutboxTableName,
        (table) => {
            table
                .uuid('ai_deep_research_analytics_event_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('ai_deep_research_run_uuid')
                .notNullable()
                .references('ai_deep_research_run_uuid')
                .inTable(AiDeepResearchRunsTableName)
                .onDelete('CASCADE');
            table.text('event_type').notNullable();
            table.text('terminal_reason').nullable();
            table.timestamp('delivered_at', { useTz: false }).nullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['ai_deep_research_run_uuid', 'event_type']);
            table.index(['delivered_at', 'created_at']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiDeepResearchAnalyticsOutboxTableName);
}
