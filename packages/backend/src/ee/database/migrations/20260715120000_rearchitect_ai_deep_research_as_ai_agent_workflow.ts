import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';
const AiDeepResearchEventsTableName = 'ai_deep_research_events';
const EventTypeCheckConstraint = 'ai_deep_research_events_event_type_check';

// Inlined snapshots of the constants valid at migration time — the live
// values in @lightdash/common can drift after this migration ships.
const eventTypes = [
    'status_changed',
    'cancellation_requested',
    'progress',
    'phase_changed',
    'tool_call',
    'query_provenance',
    'checkpoint',
    'artifact_created',
] as const;
const checkpoints = [
    'context_resolved',
    'research_completed',
    'artifact_created',
    'thread_attached',
] as const;
const legacyEventTypes = [
    'status_changed',
    'cancellation_requested',
    'progress',
] as const;

const RESULT_BATCH_SIZE = 50;

type LegacyResult = {
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
};

type ArtifactResult = {
    findings?: string[];
    limitations?: string[];
    finalReport?: string;
};

const replaceEventTypeConstraint = async (
    knex: Knex,
    allowedEventTypes: readonly string[],
) => {
    const eventTypeList = allowedEventTypes
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

const forEachRunWithResultInBatches = async <Result>(
    knex: Knex,
    update: (run: {
        ai_deep_research_run_uuid: string;
        result: Result;
    }) => Promise<unknown>,
): Promise<void> => {
    type Run = { ai_deep_research_run_uuid: string; result: Result };
    let lastUuid: string | null = null;
    for (;;) {
        const query = knex(AiDeepResearchRunsTableName)
            .select<Run[]>('ai_deep_research_run_uuid', 'result')
            .whereNotNull('result')
            .orderBy('ai_deep_research_run_uuid')
            .limit(RESULT_BATCH_SIZE);
        // eslint-disable-next-line no-await-in-loop
        const batch: Run[] = await (lastUuid
            ? query.where('ai_deep_research_run_uuid', '>', lastUuid)
            : query);
        if (batch.length === 0) {
            return;
        }
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(batch.map(update));
        lastUuid = batch[batch.length - 1].ai_deep_research_run_uuid;
    }
};

export async function up(knex: Knex): Promise<void> {
    await replaceEventTypeConstraint(knex, eventTypes);
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table
            .uuid('agent_uuid')
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('SET NULL');
        table.index('agent_uuid');
        table.jsonb('policy_snapshot');
        table.jsonb('execution_context_snapshot');
        table.text('checkpoint').checkIn([...checkpoints]);
        table.jsonb('timings');
        table.integer('execution_attempts').notNullable().defaultTo(0);
        table.text('policy_limit_reached');
    });

    await knex(AiDeepResearchRunsTableName).update({
        policy_snapshot: knex.raw(`jsonb_build_object(
            'instructions', null,
            'maxSteps', 40,
            'maxToolCalls', COALESCE((budget_snapshot->>'maxToolCalls')::int, 125),
            'maxWarehouseQueries', COALESCE((budget_snapshot->>'maxWarehouseQueries')::int, 25),
            'maxRuntimeMs', COALESCE((budget_snapshot->>'maxRuntimeMs')::int, 1800000)
        )`),
    });

    await forEachRunWithResultInBatches<LegacyResult>(knex, (run) =>
        knex(AiDeepResearchRunsTableName)
            .where('ai_deep_research_run_uuid', run.ai_deep_research_run_uuid)
            .update({
                result: {
                    findings:
                        run.result.findings?.map(
                            (finding) =>
                                `${finding.title}\n\n${finding.summary}`,
                        ) ?? [],
                    evidence:
                        run.result.findings?.flatMap((finding) =>
                            (finding.evidence ?? []).map((evidence) => ({
                                title: evidence.sourceLabel,
                                summary: evidence.description,
                                sourceType: evidence.sourceType,
                                toolName: null,
                                toolCallId: null,
                                mcpServerUuid: null,
                                queryUuid: null,
                            })),
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
                            (question) => `Unresolved question: ${question}`,
                        ),
                        ...(run.result.nextSteps ?? []).map(
                            (step) => `Next step: ${step}`,
                        ),
                    ],
                    finalReport: run.result.summary ?? '',
                },
            }),
    );

    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.jsonb('policy_snapshot').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await forEachRunWithResultInBatches<ArtifactResult>(knex, (run) =>
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
            'policy_limit_reached',
        );
    });
    await knex(AiDeepResearchEventsTableName)
        .whereNotIn('event_type', legacyEventTypes)
        .delete();
    await replaceEventTypeConstraint(knex, legacyEventTypes);
}
