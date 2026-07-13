import { AI_DEEP_RESEARCH_EVENT_TYPES } from '@lightdash/common';
import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';
const AiDeepResearchEventsTableName = 'ai_deep_research_events';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiDeepResearchEventsTableName, (table) => {
        table
            .uuid('ai_deep_research_event_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_deep_research_run_uuid')
            .notNullable()
            .references('ai_deep_research_run_uuid')
            .inTable(AiDeepResearchRunsTableName)
            .onDelete('CASCADE');
        table
            .text('event_type')
            .notNullable()
            .checkIn([...AI_DEEP_RESEARCH_EVENT_TYPES]);
        table.jsonb('payload').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index([
            'ai_deep_research_run_uuid',
            'created_at',
            'ai_deep_research_event_uuid',
        ]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(AiDeepResearchEventsTableName);
}
