import {
    AI_DEEP_RESEARCH_CHECKPOINTS,
    AI_DEEP_RESEARCH_EVENT_TYPES,
    type AiDeepResearchPolicy,
} from '@lightdash/common';
import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';
const AiDeepResearchEventsTableName = 'ai_deep_research_events';
const EventTypeCheckConstraint = 'ai_deep_research_events_event_type_check';
const legacyEventTypes = [
    'status_changed',
    'cancellation_requested',
    'progress',
] as const;

const replaceEventTypeConstraint = async (
    knex: Knex,
    eventTypes: readonly string[],
) => {
    const eventTypeList = eventTypes
        .map((eventType) => knex.raw('?', [eventType]).toQuery())
        .join(', ');
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        AiDeepResearchEventsTableName,
        EventTypeCheckConstraint,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (event_type IN (${eventTypeList}))`,
        [AiDeepResearchEventsTableName, EventTypeCheckConstraint],
    );
};

const getPolicyFromBudget = (
    budget: Record<string, number>,
): AiDeepResearchPolicy => ({
    instructions: null,
    maxSteps: 40,
    maxToolCalls: budget.maxToolCalls ?? 125,
    maxWarehouseQueries: budget.maxWarehouseQueries ?? 25,
    maxRuntimeMs: budget.maxRuntimeMs ?? 30 * 60 * 1_000,
});

const updateInBatches = async <T>(
    items: T[],
    update: (item: T) => Promise<unknown>,
    offset = 0,
): Promise<void> => {
    const batch = items.slice(offset, offset + 50);
    if (batch.length === 0) {
        return;
    }
    await Promise.all(batch.map(update));
    await updateInBatches(items, update, offset + batch.length);
};

export async function up(knex: Knex): Promise<void> {
    await replaceEventTypeConstraint(knex, AI_DEEP_RESEARCH_EVENT_TYPES);
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table
            .uuid('agent_uuid')
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('SET NULL');
        table.jsonb('policy_snapshot');
        table.jsonb('execution_context_snapshot');
        table.text('checkpoint').checkIn([...AI_DEEP_RESEARCH_CHECKPOINTS]);
        table.jsonb('timings');
        table.integer('execution_attempts').notNullable().defaultTo(0);
    });

    const runs = await knex(AiDeepResearchRunsTableName).select<
        {
            ai_deep_research_run_uuid: string;
            budget_snapshot: Record<string, number>;
            result: {
                summary?: string;
                findings?: {
                    title: string;
                    summary: string;
                    evidence?: {
                        description: string;
                        sourceType: 'lightdash' | 'warehouse' | 'web';
                        sourceLabel: string;
                    }[];
                }[];
                caveats?: string[];
                scope?: string;
                unresolvedQuestions?: string[];
                nextSteps?: string[];
            } | null;
        }[]
    >('ai_deep_research_run_uuid', 'budget_snapshot', 'result');

    await updateInBatches(runs, (run) =>
        knex(AiDeepResearchRunsTableName)
            .where('ai_deep_research_run_uuid', run.ai_deep_research_run_uuid)
            .update({
                policy_snapshot: getPolicyFromBudget(run.budget_snapshot),
                ...(run.result
                    ? {
                          result: {
                              findings:
                                  run.result.findings?.map(
                                      (finding) =>
                                          `${finding.title}\n\n${finding.summary}`,
                                  ) ?? [],
                              evidence:
                                  run.result.findings?.flatMap((finding) =>
                                      (finding.evidence ?? []).map(
                                          (evidence) => ({
                                              title: evidence.sourceLabel,
                                              summary: evidence.description,
                                              sourceType: evidence.sourceType,
                                              toolName: null,
                                              toolCallId: null,
                                              mcpServerUuid: null,
                                              queryUuid: null,
                                          }),
                                      ),
                                  ) ?? [],
                              queryUuids: [],
                              metricDefinitions: [],
                              hypotheses: [],
                              contradictions: [],
                              confidence: 'medium',
                              limitations: [
                                  ...(run.result.caveats ?? []),
                                  ...(run.result.scope
                                      ? [`Scope: ${run.result.scope}`]
                                      : []),
                                  ...(run.result.unresolvedQuestions ?? []).map(
                                      (question) =>
                                          `Unresolved question: ${question}`,
                                  ),
                                  ...(run.result.nextSteps ?? []).map(
                                      (step) => `Next step: ${step}`,
                                  ),
                              ],
                              finalReport: run.result.summary ?? '',
                          },
                      }
                    : {}),
            }),
    );

    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.jsonb('policy_snapshot').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    const runs = await knex(AiDeepResearchRunsTableName)
        .whereNotNull('result')
        .select<
            {
                ai_deep_research_run_uuid: string;
                result: {
                    findings?: string[];
                    limitations?: string[];
                    finalReport?: string;
                };
            }[]
        >('ai_deep_research_run_uuid', 'result');
    await updateInBatches(runs, (run) =>
        knex(AiDeepResearchRunsTableName)
            .where('ai_deep_research_run_uuid', run.ai_deep_research_run_uuid)
            .update({
                result: {
                    summary: run.result.finalReport ?? '',
                    findings: (run.result.findings ?? []).map((title) => ({
                        title,
                        summary: title,
                        confidence: 'medium',
                        evidence: [],
                    })),
                    caveats: run.result.limitations ?? [],
                    scope: '',
                    unresolvedQuestions: [],
                    nextSteps: [],
                },
            }),
    );
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropColumns(
            'agent_uuid',
            'policy_snapshot',
            'execution_context_snapshot',
            'checkpoint',
            'timings',
            'execution_attempts',
        );
    });
    await knex(AiDeepResearchEventsTableName)
        .whereNotIn('event_type', legacyEventTypes)
        .delete();
    await replaceEventTypeConstraint(knex, legacyEventTypes);
}
