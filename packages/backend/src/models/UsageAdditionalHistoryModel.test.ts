import { SCHEDULER_TASKS } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { aiUsageCompactedColumns } from '../analytics/eventStream/aiUsageStream';
import { historicalActivityColumns } from '../analytics/eventStream/usageHistorySources';
import { UsageAdditionalHistoryModel } from './UsageAdditionalHistoryModel';

describe('additional retained Analytics history', () => {
    const org = '00000000-0000-0000-0000-000000000001';
    const before = '2026-10-26T12:34:56.789Z';
    let database: Knex;
    let tracker: ReturnType<typeof getTracker>;
    let model: UsageAdditionalHistoryModel;
    const normalizeSql = (sql: string) => sql.replace(/\$\d+/g, '?');
    const collect = async (lines: AsyncGenerator<string>) => {
        const result: string[] = [];
        for await (const line of lines) result.push(line);
        return result;
    };
    const activities = () => collect(model.getActivityJsonLines(org, before));
    const aiUsage = () => collect(model.getAiUsageJsonLines(org, before));
    const pageRow = (id: string, json = '{"schema_version":1}') => ({
        cursor: id,
        json_line: json,
    });

    beforeEach(() => {
        database = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        tracker.reset();
        tracker.on.any(/^SET /i).response([]);
        model = new UsageAdditionalHistoryModel(database);
    });

    afterEach(async () => {
        tracker.reset();
        await database.destroy();
    });

    it('reconciles AI usage by the exact shared event ID with database provenance', async () => {
        tracker.on.select('ai_usage_ledger').response([]);
        await aiUsage();
        const { sql } = tracker.history.select[0];
        for (const { name } of aiUsageCompactedColumns) {
            expect(sql).toContain(`'${name}', `);
        }
        expect(sql).toContain("'event_id', s.event_id");
        expect(sql).toContain("'event_name', 'ai.usage'");
        expect(sql).toContain("'history_origin', 'database'");
        for (const token of [
            'input_tokens',
            'output_tokens',
            'cache_read_tokens',
            'cache_write_tokens',
            'reasoning_tokens',
            'total_tokens',
        ]) {
            expect(sql).toContain(`'${token}', s.${token}`);
        }
        // The ledger has no exact run/phase fields, and its external identity
        // is deliberately never exported into customer Analytics.
        for (const missing of [
            'external_user_id',
            'managed_agent_run_id',
            'deep_research_run_id',
            'deep_research_phase',
        ]) {
            expect(sql).toContain(`'${missing}', NULL`);
            expect(sql).not.toContain(`s.${missing}`);
        }
    });

    it('preserves PostgreSQL bigint values and timestamp microseconds without a JS parse roundtrip', async () => {
        const json =
            '{"event_id":"same-captured-id","input_tokens":9007199254740993,"event_ts":"2025-01-01T01:02:03.123456Z"}';
        tracker.on
            .select('ai_usage_ledger')
            .responseOnce([pageRow('ledger-id', json)]);
        tracker.on.select('ai_usage_ledger').response([]);
        expect(await aiUsage()).toEqual([`${json}\n`]);
        expect(tracker.history.select[0].sql).toContain(
            'to_char(s.created_at, \'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\')',
        );
        expect(
            tracker.history.all.filter(
                ({ sql }) => sql === "SET LOCAL TIME ZONE 'UTC'",
            ),
        ).toHaveLength(2);
    });

    it('requires source and project ownership while allowing explicitly organization-scoped AI records', async () => {
        tracker.on.select('ai_usage_ledger').response([]);
        const untrustedOrg = "other-org' OR true --";
        await collect(model.getAiUsageJsonLines(untrustedOrg, before));
        const { sql: raw, bindings } = tracker.history.select[0];
        const sql = normalizeSql(raw);
        expect(sql).toContain('"s"."organization_uuid" = ?');
        expect(sql).toContain('p.project_uuid::text = s.project_uuid::text');
        expect(sql).toContain(
            '(s.project_uuid is null or "o"."organization_uuid" = ?)',
        );
        expect(sql).not.toContain(untrustedOrg);
        expect(
            bindings.filter((binding) => binding === untrustedOrg),
        ).toHaveLength(2);
    });

    it('uses bounded read-only keyset pages and releases each transaction before yielding', async () => {
        tracker.on
            .select('ai_usage_ledger')
            .responseOnce([pageRow('id-a'), pageRow('id-b')]);
        tracker.on.select('ai_usage_ledger').responseOnce([pageRow('id-c')]);
        tracker.on.select('ai_usage_ledger').response([]);
        expect(await aiUsage()).toHaveLength(3);
        expect(tracker.history.select).toHaveLength(3);
        const pages = tracker.history.select;
        expect(pages[0].sql).not.toContain('"s"."ai_usage_ledger_uuid" >');
        expect(normalizeSql(pages[1].sql)).toContain(
            '"s"."ai_usage_ledger_uuid" > ?',
        );
        expect(pages[1].bindings).toContain('id-b');
        expect(pages[2].bindings).toContain('id-c');
        for (const page of pages) {
            expect(page.sql).not.toMatch(/\boffset\b/i);
            expect(page.bindings).toContain(1000);
            expect(page.bindings).toContain(before);
        }
        expect(
            tracker.history.transactions.every(
                ({ state }) => state === 'committed',
            ),
        ).toBe(true);
        for (const setting of [
            'SET TRANSACTION READ ONLY',
            "SET LOCAL statement_timeout = '10s'",
            "SET LOCAL lock_timeout = '1s'",
        ]) {
            expect(
                tracker.history.all.filter(({ sql }) => sql === setting),
            ).toHaveLength(3);
        }
    });

    it('exports historical facts through one complete schema with stable source-qualified identities', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        const queries = tracker.history.select;
        expect(queries.length).toBeGreaterThan(20);
        for (const { sql } of queries) {
            for (const { name } of historicalActivityColumns) {
                expect(sql).toContain(`'${name}', `);
            }
            expect(sql).toMatch(/'history_source', '[a-z_]+'/);
            expect(sql).toMatch(
                /'record_id', '[a-z_]+:' \|\| s\.[a-z_]+::text/,
            );
            expect(sql).not.toContain('select *');
        }
        const sources = queries.map(
            ({ sql }) => /from "([a-z_]+)" as "s"/.exec(sql)?.[1],
        );
        expect(new Set(sources)).toEqual(
            new Set([
                'ai_thread',
                'ai_prompt',
                'ai_prompt_interrupt',
                'ai_prompt_steer',
                'ai_agent_tool_call',
                'ai_agent_tool_result',
                'ai_agent_tool_call_error',
                'ai_agent_reasoning',
                'ai_prompt_context',
                'ai_prompt_decision',
                'ai_prompt_decision_shadow',
                'ai_thread_compaction',
                'ai_thread_share',
                'ai_writeback_run',
                'ai_deep_research_runs',
                'ai_deep_research_events',
                'ai_slack_artifact_deliveries',
                'mcp_tool_call',
                'agent_action_log',
                'scheduler_log',
                'download_audit',
                'ai_router_decision',
                'ai_eval_run',
                'ai_eval_run_result',
                'ai_eval_run_result_assessment',
                'ai_artifacts',
                'ai_artifact_versions',
                'ai_thread_file',
            ]),
        );
    });

    it('retains all available ages and soft-deleted project records, including today before the snapshot', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        for (const { sql: raw, bindings } of tracker.history.select) {
            const sql = normalizeSql(raw);
            expect(sql).toMatch(/"s"\."[a-z_]+" < \?/);
            expect(bindings).toContain(before);
            expect(sql).not.toMatch(/(?:created_at|occurred_at)"?\s*>=?/);
            expect(sql).not.toContain('deleted_at');
            expect(sql).not.toMatch(/\binterval\b/i);
            expect(sql).toContain('"o"."organization_uuid" = ?');
            expect(
                bindings.filter((binding) => binding === org).length,
            ).toBeGreaterThanOrEqual(2);
        }
    });

    it('records prompt response and latest retry at real stored times without inventing lifecycle history', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        const prompts = tracker.history.select.filter(({ sql }) =>
            sql.includes('from "ai_prompt" as "s"'),
        );
        expect(prompts).toHaveLength(3);
        expect(
            prompts.map(
                ({ sql }) => /'activity_type', '([^']+)'/.exec(sql)?.[1],
            ),
        ).toEqual([
            'agent_prompt_recorded',
            'agent_prompt_responded',
            'agent_prompt_latest_retry',
        ]);
        expect(prompts[1].sql).toContain('to_char(s.responded_at,');
        expect(prompts[2].sql).toContain('to_char(s.retried_at,');
        expect(prompts[0].sql).toContain("'human_score', s.human_score");
        expect(prompts[0].sql).toContain(
            "'total_tokens', CASE WHEN jsonb_typeof(s.token_usage->'totalTokens') = 'number' THEN s.token_usage->'totalTokens' END",
        );
        for (const { sql } of prompts) {
            expect(sql).toContain(
                'inner join "ai_thread" as "t" on "t"."ai_thread_uuid" = "s"."ai_thread_uuid"',
            );
            expect(normalizeSql(sql)).toContain('t.organization_uuid = ?');
            expect(sql).not.toContain('agent_request_events');
        }
    });

    it('requires child facts to join an owned prompt/thread or research run', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        for (const table of [
            'ai_agent_tool_call',
            'ai_agent_tool_result',
            'ai_prompt_interrupt',
            'ai_agent_tool_call_error',
        ]) {
            const { sql } = tracker.history.select.find(({ sql: value }) =>
                value.includes(`from "${table}" as "s"`),
            )!;
            expect(sql).toContain(
                'inner join "ai_prompt" as "ap" on "ap"."ai_prompt_uuid" = "s"."ai_prompt_uuid"',
            );
            expect(sql).toContain(
                'inner join "ai_thread" as "t" on "t"."ai_thread_uuid" = "ap"."ai_thread_uuid"',
            );
            expect(normalizeSql(sql)).toContain('t.organization_uuid = ?');
        }
        const research = tracker.history.select.find(({ sql }) =>
            sql.includes('from "ai_deep_research_events" as "s"'),
        )!;
        expect(research.sql).toContain(
            'inner join "ai_deep_research_runs" as "r"',
        );
        expect(normalizeSql(research.sql)).toContain('r.organization_uuid = ?');
    });

    it('owns evaluations through their configured agent and constrains claimed files to the same organization', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        const assessment = tracker.history.select.find(({ sql }) =>
            sql.includes('from "ai_eval_run_result_assessment" as "s"'),
        )!;
        expect(assessment.sql).toContain(
            'inner join "ai_eval_run_result" as "er"',
        );
        expect(assessment.sql).toContain('inner join "ai_eval_run" as "evr"');
        expect(assessment.sql).toContain('inner join "ai_eval" as "e"');
        expect(assessment.sql).toContain('inner join "ai_agent" as "ag"');
        expect(normalizeSql(assessment.sql)).toContain(
            'ag.organization_uuid = ?',
        );
        const file = tracker.history.select.find(({ sql }) =>
            sql.includes('from "ai_thread_file" as "s"'),
        )!;
        expect(normalizeSql(file.sql)).toContain(
            '("s"."ai_thread_uuid" is null or "t"."organization_uuid" = ?)',
        );
        expect(normalizeSql(file.sql)).toContain('s.organization_uuid = ?');
        expect(normalizeSql(file.sql)).toContain(
            '(t.project_uuid is null or "o"."organization_uuid" = ?)',
        );
        expect(file.sql).not.toMatch(/s\.(?:content|file_name)/);
    });

    it('exports aggregates once on snapshots rather than repeating tokens and feedback across transition facts', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        for (const { sql } of tracker.history.select) {
            if (
                sql.includes("'activity_type', 'agent_prompt_responded'") ||
                sql.includes("'activity_type', 'agent_prompt_latest_retry'")
            ) {
                expect(sql).toContain("'total_tokens', NULL");
                expect(sql).toContain("'human_score', NULL");
            }
            if (
                sql.includes("'activity_type', 'deep_research_run_started'") ||
                sql.includes("'activity_type', 'deep_research_run_completed'")
            ) {
                expect(sql).toContain("'input_tokens', NULL");
                expect(sql).toContain("'output_tokens', NULL");
                expect(sql).toContain("'total_tokens', NULL");
                expect(sql).toContain("'duration_ms', NULL");
            }
        }
    });

    it('exports MCP database facts with their recorded direction, status and timing, excluding external identities', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        const { sql } = tracker.history.select.find(({ sql: value }) =>
            value.includes('from "mcp_tool_call" as "s"'),
        )!;
        expect(sql).toContain(
            "'record_id', 'mcp_call_recorded:' || s.mcp_tool_call_uuid::text",
        );
        expect(sql).toContain("'direction', s.direction");
        expect(sql).toContain("'success', s.status = 'success'");
        expect(sql).toContain("'duration_ms', s.duration_ms");
        expect(sql).toContain(
            "'user_id', CASE WHEN s.auth_type <> 'service-account' THEN s.user_uuid END",
        );
        expect(sql).not.toMatch(
            /s\.(?:mcp_session_id|user_agent|tool_args|result_metadata|error_message)/,
        );
    });

    it('only reads export-specific scheduler logs with authoritative organization and project provenance', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        const { sql: raw, bindings } = tracker.history.select.find(({ sql }) =>
            sql.includes('from "scheduler_log" as "s"'),
        )!;
        const sql = normalizeSql(raw);
        expect(bindings).toContain(SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY);
        expect(bindings).toContain(
            SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
        );
        expect(sql).toContain("s.details->>'organizationUuid' = ?");
        expect(sql).toContain('"p"."project_uuid" is not null');
        expect(sql).toContain(
            "p.project_uuid::text = s.details->>'projectUuid'::text",
        );
        expect(sql).toContain("'user_id', s.details->>'createdByUserUuid'");
        expect(sql).not.toMatch(
            /(?:s\.target|"s"\."target"|s\.details[,\s)]|error_message|fileUrl)/,
        );
    });

    it('never projects sensitive payloads or infers native tool completion from result rows', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        const sql = tracker.history.select
            .map(({ sql: value }) => value)
            .join('\n');
        expect(sql).not.toMatch(
            /s\.(?:prompt|response|human_feedback|text|tool_args|raw_args|result|metadata|payload|serialized_input|summary|title|thread_context|entity_ref|display_name|runtime_overrides|render_inputs|rendered_images|message_ts|agent_identity|pr_url|branch_name|result_markdown)(?:[,\s)]|$)/,
        );
        // Inspecting nullness for a current status does not disclose error text.
        expect(sql).not.toMatch(/'[^']+', s\.error_message/);
        const result = tracker.history.select.find(({ sql: value }) =>
            value.includes('from "ai_agent_tool_result" as "s"'),
        )!;
        expect(result.sql).toContain(
            "'activity_type', 'agent_tool_result_recorded'",
        );
        expect(result.sql).toContain("'duration_ms', NULL");
        expect(result.sql).toContain("'success', NULL");
        expect(result.sql).not.toContain('agent_steps');
    });

    it('recovers download audits as requests without inventing success, including records whose project was deleted', async () => {
        tracker.on.select(() => true).response([]);
        await activities();
        const { sql: raw, bindings } = tracker.history.select.find(({ sql }) =>
            sql.includes('from "download_audit" as "s"'),
        )!;
        const sql = normalizeSql(raw);
        expect(sql).toContain(
            "'record_id', 'download_requested:' || s.download_uuid::text",
        );
        expect(sql).toContain("'activity_type', 'download_requested'");
        expect(sql).toContain("'event_ts', to_char(s.downloaded_at,");
        expect(sql).toContain('"s"."downloaded_at" < ?');
        expect(sql).toContain("'current_status', 'requested'");
        expect(sql).toContain("'success', NULL");
        expect(sql).toContain("'query_id', s.query_uuid");
        expect(sql).toContain("'file_type', s.file_type");
        expect(sql).toContain("'context', s.original_query_context");
        expect(sql).toContain(
            '(s.project_uuid is null or "o"."organization_uuid" = ?)',
        );
        expect(sql).toContain('s.organization_uuid = ?');
        expect(sql).not.toContain('p.project_uuid is not null');
        expect(sql).not.toMatch(
            /(?:s\.(?:target|file_name|results)|query_history|\boffset\b)/,
        );
        expect(bindings).toContain(before);
        expect(bindings.filter((value) => value === org)).toHaveLength(2);
    });

    it('propagates failures rather than falsely declaring missing data covered', async () => {
        tracker.on.select('ai_usage_ledger').simulateError('statement timeout');
        await expect(aiUsage()).rejects.toThrow('statement timeout');
        expect(tracker.history.transactions[0].state).toBe('rolled back');
    });
});
