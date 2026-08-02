import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    AiAgentToolCallErrorTableName,
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
} from '../database/entities/ai';
import {
    AiDeepResearchAnalyticsOutboxTableName,
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTableName,
} from '../database/entities/aiDeepResearch';
import { AiDeepResearchRunModel } from './AiDeepResearchRunModel';

const RUN_UUID = '00000000-0000-0000-0000-000000000001';
const EVENT_UUID = '00000000-0000-0000-0000-000000000002';

const reportMarkdown =
    'Intro.\n\n## Finding\n\n<confidence level="high">ok</confidence>\n\n## Conclusion\n\n- done';

const runRow = (overrides: Record<string, unknown> = {}) => ({
    ai_deep_research_run_uuid: RUN_UUID,
    prompt_uuid: 'prompt-1',
    created_at: new Date('2026-07-31T10:00:00.000Z'),
    status: 'running',
    ...overrides,
});

describe('AiDeepResearchRunModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AiDeepResearchRunModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    const mockEmptyTerminalMetrics = () => {
        tracker.on.select(AiAgentToolCallTableName).response([]);
        tracker.on.select(AiAgentToolResultTableName).response([]);
        tracker.on.select(AiAgentToolCallErrorTableName).response([]);
    };

    afterEach(() => {
        tracker.reset();
    });

    it('claims a queued run only when cancellation has not been requested', async () => {
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce([runRow()]);
        tracker.on.insert(AiDeepResearchEventsTableName).responseOnce([]);

        const run = await model.claimQueuedRun(RUN_UUID);

        expect(run).toEqual(runRow());
        const [update] = tracker.history.update;
        expect(update.sql).toContain('set "status" = $1');
        expect(update.sql).toContain('"cancellation_requested_at" is null');
        expect(update.bindings).toEqual(
            expect.arrayContaining(['queued', 'running', RUN_UUID]),
        );
        expect(tracker.history.insert[0].bindings).toEqual(
            expect.arrayContaining([
                RUN_UUID,
                'status_changed',
                JSON.stringify({ status: 'running' }),
            ]),
        );
    });

    it('scopes user-facing lookups by organization and project', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        await model.findByUuidScoped({
            aiDeepResearchRunUuid: RUN_UUID,
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
        });

        expect(tracker.history.select[0].bindings).toEqual([
            RUN_UUID,
            'organization-1',
            'project-1',
            1,
        ]);
    });

    it('scopes idempotent prompt lookups to the creating user', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        await model.findByPromptScoped({
            promptUuid: 'prompt-1',
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
            createdByUserUuid: 'user-1',
        });

        expect(tracker.history.select[0].bindings).toEqual([
            'prompt-1',
            'organization-1',
            'project-1',
            'user-1',
            1,
        ]);
    });

    it('loads conversation runs by prompt within the organization and project', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        await model.findByPromptUuidsScoped({
            promptUuids: ['prompt-1', 'prompt-2'],
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
        });

        expect(tracker.history.select[0].bindings).toEqual([
            'prompt-1',
            'prompt-2',
            'organization-1',
            'project-1',
        ]);
        expect(tracker.history.select[0].sql).toContain(
            'select "prompt_uuid", "result_markdown"',
        );
        expect(tracker.history.select[0].sql).not.toContain(
            'result_chart_data',
        );
        expect(tracker.history.select[0].sql).toContain(
            'coalesce(report_expires_at, completed_at + interval',
        );
        expect(tracker.history.select[0].sql).toContain(
            '"report_expired_at" is null',
        );
    });

    it('does not query for an empty conversation', async () => {
        await expect(
            model.findByPromptUuidsScoped({
                promptUuids: [],
                organizationUuid: 'organization-1',
                projectUuid: 'project-1',
            }),
        ).resolves.toEqual([]);

        expect(tracker.history.select).toHaveLength(0);
    });

    it('loads thread status without selecting report content', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        await model.findAgentContextByThreadScoped({
            aiThreadUuid: 'thread-1',
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
            createdByUserUuid: 'user-1',
        });

        const [query] = tracker.history.select;
        expect(query.sql).toContain(
            'coalesce(octet_length(result_markdown), 0) > 0',
        );
        expect(query.sql).toContain(
            'coalesce(\n                            report_expires_at',
        );
        expect(query.sql).not.toContain('select "result_markdown"');
        expect(query.bindings).toEqual([
            'thread-1',
            'organization-1',
            'project-1',
            'user-1',
        ]);
    });

    it('lists report metadata without selecting report content', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        await model.findReportSummariesByThreadScoped({
            aiThreadUuid: 'thread-1',
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
            createdByUserUuid: 'user-1',
        });

        const [query] = tracker.history.select;
        expect(query.sql).toContain(
            'octet_length(result_markdown) as content_size_bytes',
        );
        expect(query.sql).not.toContain('select "result_markdown"');
        expect(query.sql).toContain('octet_length(result_markdown) > 0');
        expect(query.sql).toContain(
            'coalesce(report_expires_at, completed_at + interval',
        );
        expect(query.sql).toContain('"report_expired_at" is null');
        expect(query.bindings).toEqual([
            'thread-1',
            'organization-1',
            'project-1',
            'user-1',
        ]);
    });

    it('loads report content only for one scoped run', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        await model.findReportByUuidThreadScoped({
            aiDeepResearchRunUuid: RUN_UUID,
            aiThreadUuid: 'thread-1',
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
            createdByUserUuid: 'user-1',
        });

        const [query] = tracker.history.select;
        expect(query.sql).toContain(
            'select "ai_deep_research_run_uuid", "prompt", "result_markdown"',
        );
        expect(query.sql).toContain('octet_length(result_markdown) > 0');
        expect(query.sql).toContain(
            'coalesce(report_expires_at, completed_at + interval',
        );
        expect(query.sql).toContain('"report_expired_at" is null');
        expect(query.bindings).toEqual([
            RUN_UUID,
            'thread-1',
            'organization-1',
            'project-1',
            'user-1',
            1,
        ]);
    });

    it('loads only the latest progress event for each run', async () => {
        tracker.on.select(AiDeepResearchEventsTableName).responseOnce([]);

        await model.findLatestProgressByRunUuids(['run-1', 'run-2']);

        const [query] = tracker.history.select;
        expect(query.sql).toContain(
            'distinct on ("ai_deep_research_run_uuid")',
        );
        expect(query.sql).toContain('"event_type" = $3');
        expect(query.sql).toContain(
            'order by "ai_deep_research_run_uuid" asc, "created_at" desc, "ai_deep_research_event_uuid" desc',
        );
        expect(query.bindings).toEqual(['run-1', 'run-2', 'progress']);
    });

    it('does not overwrite a cancellation request with completion', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        const updated = await model.markCompleted(RUN_UUID, reportMarkdown, {});

        expect(updated).toBe(false);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('atomically accumulates each reported token class and records incomplete usage', async () => {
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce(1);

        await model.accumulateTokenUsage(RUN_UUID, {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 20,
            cacheWriteTokens: null,
            reasoningTokens: 2,
            totalTokens: 35,
        });

        const [update] = tracker.history.update;
        expect(update.sql).toContain(
            'coalesce("input_tokens", 0) + $2::integer',
        );
        expect(update.sql).toContain(
            'case when $7::integer is null then "cache_write_tokens"',
        );
        expect(update.sql).toContain(
            'coalesce("token_usage_complete", true) and $13',
        );
        expect(update.bindings).toContain(false);
        expect(update.bindings).toContain(null);
    });

    it('persists deduplicated terminal operational metrics with the report', async () => {
        const createdAt = new Date('2026-07-31T10:00:00.000Z');
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([runRow()]);
        tracker.on.select(AiAgentToolCallTableName).responseOnce([
            {
                tool_call_id: 'report-success',
                tool_name: 'submitResearchReport',
                created_at: createdAt,
            },
            {
                tool_call_id: 'report-failed',
                tool_name: 'submitResearchReport',
                created_at: new Date(createdAt.getTime() - 1),
            },
            {
                tool_call_id: 'warehouse-1',
                tool_name: 'runSql',
                created_at: createdAt,
            },
            {
                tool_call_id: 'search-1',
                tool_name: 'searchContent',
                created_at: createdAt,
            },
        ]);
        tracker.on.select(AiAgentToolResultTableName).responseOnce([
            {
                tool_call_id: 'report-success',
                metadata: { status: 'success' },
            },
            {
                tool_call_id: 'report-failed',
                metadata: { status: 'error' },
            },
        ]);
        tracker.on
            .select(AiAgentToolCallErrorTableName)
            .responseOnce([
                { tool_call_id: 'report-failed' },
                { tool_call_id: 'schema-invalid' },
            ]);
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([runRow({ status: 'completed' })]);
        tracker.on.insert(AiDeepResearchEventsTableName).responseOnce([]);
        tracker.on
            .insert(AiDeepResearchAnalyticsOutboxTableName)
            .responseOnce([]);

        await model.markCompleted(RUN_UUID, reportMarkdown, {
            chart: {} as never,
        });

        const [update] = tracker.history.update;
        expect(update.bindings).toEqual(expect.arrayContaining([4, 2, 1, 1]));
        expect(update.sql).toContain('"tool_call_count" = $');
        expect(update.sql).toContain('"tool_error_count" = $');
        expect(update.sql).toContain('"warehouse_query_count" = $');
        expect(update.sql).toContain('"findings_count" = $');
        expect(update.sql).toContain('"chart_count" = $');
        expect(update.sql).toContain('"duration_ms" =');
    });

    it.each(['completed', 'partially_completed'] as const)(
        'persists the 30-day report expiry when a run is %s',
        async (status) => {
            mockEmptyTerminalMetrics();
            tracker.on
                .select(AiDeepResearchRunsTableName)
                .responseOnce([runRow()]);
            tracker.on
                .update(AiDeepResearchRunsTableName)
                .responseOnce([runRow({ status })]);
            tracker.on.insert(AiDeepResearchEventsTableName).responseOnce([]);
            tracker.on
                .insert(AiDeepResearchAnalyticsOutboxTableName)
                .responseOnce([]);

            const updated =
                status === 'completed'
                    ? await model.markCompleted(RUN_UUID, reportMarkdown, {})
                    : await model.markPartiallyCompleted(
                          RUN_UUID,
                          reportMarkdown,
                          {},
                          'query_limit',
                      );

            expect(updated).toBe(true);
            const [update] = tracker.history.update;
            expect(update.sql).toContain(
                `"report_expires_at" = now() + interval '30 days'`,
            );
            expect(update.sql).toContain('"report_expired_at" = $');
            expect(update.bindings).toEqual(
                expect.arrayContaining([status, reportMarkdown, RUN_UUID]),
            );
        },
    );

    it('deletes only an unstarted failed run so enqueue failures can retry', async () => {
        tracker.on.delete(AiDeepResearchRunsTableName).responseOnce(1);

        const deleted = await model.deleteUnstartedFailedRun(RUN_UUID);

        expect(deleted).toBe(true);
        const [deletion] = tracker.history.delete;
        expect(deletion.sql).toContain('"status" = $2');
        expect(deletion.sql).toContain('"started_at" is null');
        expect(deletion.bindings).toEqual([RUN_UUID, 'failed']);
    });

    it('cancels a queued run immediately and records both lifecycle events', async () => {
        mockEmptyTerminalMetrics();
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([runRow({ status: 'cancelled' })]);
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([runRow({ status: 'cancelled' })]);
        tracker.on.insert(AiDeepResearchEventsTableName).response([]);
        tracker.on.insert(AiDeepResearchAnalyticsOutboxTableName).response([]);

        const run = await model.requestCancellation(RUN_UUID);

        expect(run).toEqual(runRow({ status: 'cancelled' }));
        expect(tracker.history.update).toHaveLength(2);
        expect(tracker.history.update[0].bindings).toEqual(
            expect.arrayContaining(['queued', 'cancelled', RUN_UUID]),
        );
        expect(tracker.history.insert).toHaveLength(3);
        expect(tracker.history.insert[0].bindings).toContain(
            'cancellation_requested',
        );
        expect(tracker.history.insert[1].bindings).toContain('status_changed');
        expect(tracker.history.insert[2].bindings).toContain('run_completed');
        expect(tracker.history.insert[2].bindings).toContain(
            'user_cancellation',
        );
    });

    it('records a cancellation request without declaring a running job cancelled', async () => {
        const requestedAt = new Date('2026-07-13T12:01:00.000Z');
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce([]);
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([runRow({ cancellation_requested_at: requestedAt })]);
        tracker.on.insert(AiDeepResearchEventsTableName).responseOnce([]);

        const run = await model.requestCancellation(RUN_UUID);

        expect(run).toEqual(runRow({ cancellation_requested_at: requestedAt }));
        expect(tracker.history.update).toHaveLength(2);
        expect(tracker.history.update[1].bindings).toEqual(
            expect.arrayContaining(['running', RUN_UUID]),
        );
        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.insert[0].bindings).toContain(
            'cancellation_requested',
        );
    });

    it('uses a stable created-at and uuid keyset for event pagination', async () => {
        tracker.on.select(AiDeepResearchEventsTableName).responseOnce([]);
        const createdAt = '2026-07-13 12:00:00.000001';

        await model.listEvents({
            aiDeepResearchRunUuid: RUN_UUID,
            cursor: { createdAt, eventUuid: EVENT_UUID },
            limit: 20,
        });

        const [select] = tracker.history.select;
        expect(select.sql).toContain(
            '(created_at, ai_deep_research_event_uuid) > ($2::timestamp, $3::uuid)',
        );
        expect(select.sql).toContain('order by "created_at" asc');
        expect(select.sql).toContain(
            '"ai_deep_research_event_uuid" asc limit $4',
        );
        expect(select.bindings).toEqual([RUN_UUID, createdAt, EVENT_UUID, 21]);
    });

    it('fails only stale running jobs and records a terminal event per run', async () => {
        mockEmptyTerminalMetrics();
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([
                runRow(),
                runRow({ ai_deep_research_run_uuid: 'run-2' }),
            ]);
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([runRow({ status: 'failed' })]);
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce([
            runRow({
                ai_deep_research_run_uuid: 'run-2',
                status: 'failed',
            }),
        ]);
        tracker.on.insert(AiDeepResearchEventsTableName).response([]);
        tracker.on.insert(AiDeepResearchAnalyticsOutboxTableName).response([]);

        const runs = await model.markStaleRunsAsFailed(75, 'stale');

        expect(runs).toHaveLength(2);
        const [update] = tracker.history.update;
        expect(update.bindings).toEqual(
            expect.arrayContaining(['running', 75, 'failed', 'stale']),
        );
        expect(tracker.history.insert).toHaveLength(4);
        expect(tracker.history.insert[2].bindings).toContain('internal_error');
        expect(tracker.history.insert[3].bindings).toContain('internal_error');
    });

    it('scrubs an expired report and its run-scoped provenance', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([
            {
                ai_deep_research_run_uuid: RUN_UUID,
                prompt_uuid: 'prompt-1',
            },
        ]);
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([
            {
                ai_deep_research_run_uuid: RUN_UUID,
            },
        ]);
        tracker.on.select(AiAgentToolCallTableName).responseOnce([
            {
                ai_agent_tool_call_uuid: '00000000-0000-0000-0000-000000000003',
                tool_call_id: 'tool-1',
            },
        ]);
        tracker.on.delete(AiAgentToolResultTableName).responseOnce(1);
        tracker.on.delete(AiAgentToolCallErrorTableName).responseOnce(0);
        tracker.on.delete(AiAgentToolCallTableName).responseOnce(1);
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce(1);

        const result = await model.cleanExpiredReports(100);

        expect(result).toEqual({ scanned: 1, expired: 1, failed: 0 });
        expect(tracker.history.delete).toHaveLength(3);
        expect(tracker.history.update.at(-1)?.sql).toContain(
            '"result_markdown" = $1',
        );
        expect(tracker.history.update.at(-1)?.sql).toContain(
            '"result_chart_data" = $2',
        );
    });
});
