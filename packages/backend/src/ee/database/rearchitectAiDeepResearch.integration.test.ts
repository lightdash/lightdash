import { SEED_ORG_1, SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import {
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTableName,
} from './entities/aiDeepResearch';

// The harness loads compiled migrations from dist, so knex knows this
// migration by its .js filename.
const MIGRATION_NAME =
    '20260715120000_rearchitect_ai_deep_research_as_ai_agent_workflow.js';

const legacyBudget = {
    maxRuntimeMs: 900_000,
    maxTokens: 500_000,
    maxToolCalls: 50,
    maxWarehouseQueries: 10,
    maxResultRows: 5_000,
};

const legacyResult = {
    summary: 'Revenue fell after a price change.',
    findings: [
        {
            title: 'Conversion dropped',
            summary: 'Checkout conversion fell 12% after the price change.',
            confidence: 'high',
            evidence: [
                {
                    description: 'Weekly conversion funnel query',
                    sourceType: 'warehouse',
                    sourceLabel: 'orders_conversion_weekly',
                },
                {
                    description: 'Pricing page change log',
                    sourceType: 'lightdash',
                    sourceLabel: 'pricing_dashboard',
                },
            ],
        },
    ],
    caveats: ['Only four weeks of data'],
    scope: 'Last month',
    unresolvedQuestions: ['Did a competitor change prices too?'],
    nextSteps: ['Backfill older conversion data'],
};

describe('rearchitect ai deep research migration', () => {
    let database: Knex;
    let fullRunUuid: string;
    let nullResultRunUuid: string;
    let sparseResultRunUuid: string;
    let partialBudgetRunUuid: string;
    const seededRunUuids: string[] = [];

    const insertLegacyRun = async (row: {
        result: object | null;
        budget: object;
    }): Promise<string> => {
        const [inserted] = await database(AiDeepResearchRunsTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'Legacy deep research run',
                status: row.result ? 'completed' : 'queued',
                result: row.result,
                budget_snapshot: row.budget,
            })
            .returning('ai_deep_research_run_uuid');
        const runUuid: string = inserted.ai_deep_research_run_uuid;
        seededRunUuids.push(runUuid);
        return runUuid;
    };

    const getRun = async (runUuid: string) =>
        database(AiDeepResearchRunsTableName)
            .where('ai_deep_research_run_uuid', runUuid)
            .first();

    const hasColumn = async (column: string): Promise<boolean> =>
        database.schema.hasColumn(AiDeepResearchRunsTableName, column);

    beforeAll(async () => {
        database = getTestContext().db;

        // The harness applied every migration; step below the one under test
        // and seed legacy-shaped rows against the pre-migration schema.
        await database.migrate.down({ name: MIGRATION_NAME });

        fullRunUuid = await insertLegacyRun({
            result: legacyResult,
            budget: legacyBudget,
        });
        nullResultRunUuid = await insertLegacyRun({
            result: null,
            budget: {},
        });
        sparseResultRunUuid = await insertLegacyRun({
            result: { summary: 'Only a summary' },
            budget: legacyBudget,
        });
        partialBudgetRunUuid = await insertLegacyRun({
            result: null,
            budget: { maxToolCalls: 7 },
        });
        await database(AiDeepResearchEventsTableName).insert({
            ai_deep_research_run_uuid: fullRunUuid,
            event_type: 'status_changed',
            payload: { status: 'queued' },
        });
    });

    afterAll(async () => {
        if (seededRunUuids.length > 0) {
            await database(AiDeepResearchRunsTableName)
                .whereIn('ai_deep_research_run_uuid', seededRunUuids)
                .delete();
        }
        // Leave the schema fully migrated for whatever runs next.
        await database.migrate.latest();
    });

    describe('up', () => {
        beforeAll(async () => {
            await database.migrate.up({ name: MIGRATION_NAME });
        });

        it('converts a legacy report into the artifact shape', async () => {
            const run = await getRun(fullRunUuid);

            expect(run.result).toEqual({
                findings: [
                    'Conversion dropped\n\nCheckout conversion fell 12% after the price change.',
                ],
                evidence: [
                    {
                        title: 'orders_conversion_weekly',
                        summary: 'Weekly conversion funnel query',
                        sourceType: 'warehouse',
                        toolName: null,
                        toolCallId: null,
                        mcpServerUuid: null,
                        queryUuid: null,
                    },
                    {
                        title: 'pricing_dashboard',
                        summary: 'Pricing page change log',
                        sourceType: 'lightdash',
                        toolName: null,
                        toolCallId: null,
                        mcpServerUuid: null,
                        queryUuid: null,
                    },
                ],
                queryUuids: [],
                metricDefinitions: [],
                hypotheses: [],
                contradictions: [],
                confidence: 'medium',
                limitations: [
                    'Only four weeks of data',
                    'Scope: Last month',
                    'Unresolved question: Did a competitor change prices too?',
                    'Next step: Backfill older conversion data',
                ],
                finalReport: 'Revenue fell after a price change.',
            });
        });

        it('converts a report missing findings evidence and optional sections', async () => {
            const run = await getRun(sparseResultRunUuid);

            expect(run.result).toEqual({
                findings: [],
                evidence: [],
                queryUuids: [],
                metricDefinitions: [],
                hypotheses: [],
                contradictions: [],
                confidence: 'medium',
                limitations: [],
                finalReport: 'Only a summary',
            });
        });

        it('leaves a run without a result untouched while backfilling its policy', async () => {
            const run = await getRun(nullResultRunUuid);

            expect(run.result).toBeNull();
            expect(run.policy_snapshot).toEqual({
                instructions: null,
                maxSteps: 40,
                maxToolCalls: 125,
                maxWarehouseQueries: 25,
                maxRuntimeMs: 1_800_000,
            });
            expect(run.execution_attempts).toBe(0);
            expect(run.agent_uuid).toBeNull();
            expect(run.checkpoint).toBeNull();
            expect(run.policy_limit_reached).toBeNull();
        });

        it('backfills the policy from whatever budget keys a legacy run recorded', async () => {
            const partialBudgetRun = await getRun(partialBudgetRunUuid);
            const fullBudgetRun = await getRun(fullRunUuid);

            expect(partialBudgetRun.policy_snapshot).toEqual({
                instructions: null,
                maxSteps: 40,
                maxToolCalls: 7,
                maxWarehouseQueries: 25,
                maxRuntimeMs: 1_800_000,
            });
            expect(fullBudgetRun.policy_snapshot).toEqual({
                instructions: null,
                maxSteps: 40,
                maxToolCalls: 50,
                maxWarehouseQueries: 10,
                maxRuntimeMs: 900_000,
            });
        });

        it('requires a policy snapshot on new runs', async () => {
            await expect(
                database(AiDeepResearchRunsTableName).insert({
                    organization_uuid: SEED_ORG_1.organization_uuid,
                    project_uuid: SEED_PROJECT.project_uuid,
                    created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                    prompt: 'Missing policy snapshot',
                    budget_snapshot: legacyBudget,
                }),
            ).rejects.toThrow(/policy_snapshot/);
        });

        it('accepts the workflow event types and still rejects unknown ones', async () => {
            await database(AiDeepResearchEventsTableName).insert({
                ai_deep_research_run_uuid: fullRunUuid,
                event_type: 'checkpoint',
                payload: { checkpoint: 'artifact_created' },
            });

            await expect(
                database(AiDeepResearchEventsTableName).insert({
                    ai_deep_research_run_uuid: fullRunUuid,
                    event_type: 'not_an_event_type',
                    payload: {},
                }),
            ).rejects.toThrow(/ai_deep_research_events_event_type_check/);
        });
    });

    describe('down', () => {
        beforeAll(async () => {
            await database.migrate.down({ name: MIGRATION_NAME });
        });

        it('converts the artifact back into the legacy report shape, losing detail by design', async () => {
            const run = await getRun(fullRunUuid);

            expect(run.result).toEqual({
                summary: 'Revenue fell after a price change.',
                findings: [
                    {
                        title: 'Conversion dropped\n\nCheckout conversion fell 12% after the price change.',
                        summary:
                            'Conversion dropped\n\nCheckout conversion fell 12% after the price change.',
                        confidence: 'medium',
                        evidence: [],
                    },
                ],
                caveats: [
                    'Only four weeks of data',
                    'Scope: Last month',
                    'Unresolved question: Did a competitor change prices too?',
                    'Next step: Backfill older conversion data',
                ],
                scope: '',
                unresolvedQuestions: [],
                nextSteps: [],
            });
        });

        it('keeps a null result null through the round trip', async () => {
            const run = await getRun(nullResultRunUuid);
            expect(run.result).toBeNull();
        });

        it('drops the workflow columns', async () => {
            expect(await hasColumn('policy_snapshot')).toBe(false);
            expect(await hasColumn('agent_uuid')).toBe(false);
            expect(await hasColumn('execution_context_snapshot')).toBe(false);
            expect(await hasColumn('checkpoint')).toBe(false);
            expect(await hasColumn('timings')).toBe(false);
            expect(await hasColumn('execution_attempts')).toBe(false);
            expect(await hasColumn('policy_limit_reached')).toBe(false);
        });

        it('removes workflow events and rejects new ones under the legacy constraint', async () => {
            const events = await database(AiDeepResearchEventsTableName)
                .select('event_type')
                .where('ai_deep_research_run_uuid', fullRunUuid);
            expect(events.map((event) => event.event_type)).toEqual([
                'status_changed',
            ]);

            await expect(
                database(AiDeepResearchEventsTableName).insert({
                    ai_deep_research_run_uuid: fullRunUuid,
                    event_type: 'checkpoint',
                    payload: { checkpoint: 'artifact_created' },
                }),
            ).rejects.toThrow(/ai_deep_research_events_event_type_check/);
        });
    });
});
