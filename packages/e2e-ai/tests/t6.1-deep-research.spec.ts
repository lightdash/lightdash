import {
    assertUnreachable,
    isAiDeepResearchRunTerminal,
} from '@lightdash/common';
import type { Pool } from 'pg';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { composer, openNewThreadPage } from '../lib/agentUi';
import { replyOfResponse, resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { queryRows } from '../lib/db';
import {
    researchPath,
    runSchema,
    watchRun,
    withRunCancelledAfter,
} from '../lib/deepResearch';
import { isPost } from '../lib/explorer';
import { expect, test } from '../lib/fixtures';
import { reportObservation } from '../lib/report';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T6.1. Runs at the org's deep research limits, which it never reads or
// changes. V only on whether the run queried the warehouse at all; failed,
// cancelled, or partially_completed without a budget reason is real, and so
// is a run that stops making progress. Preconditions: F1.

const QUESTION = 'Why do some order statuses have more orders than others?';
const BUDGET_REASONS = [
    'tool_limit',
    'query_limit',
    'token_limit',
    'time_limit',
];

const runRowSchema = z.object({
    status: z.string(),
    terminal_reason: z.string().nullable(),
    failure_stage: z.string().nullable(),
    error_message: z.string().nullable(),
    result_markdown: z.string().nullable(),
    warehouse_query_count: z.number().nullable(),
    input_tokens: z.number().nullable(),
    output_tokens: z.number().nullable(),
    total_tokens: z.number().nullable(),
    cache_read_tokens: z.number().nullable(),
    cache_write_tokens: z.number().nullable(),
    reasoning_tokens: z.number().nullable(),
    token_usage_complete: z.boolean().nullable(),
    duration_ms: z.number().nullable(),
    ai_queries: z.number(),
});

// AI queries by the run's user and project between its start and end.
const readRunRow = async (db: Pool, runUuid: string) =>
    single(
        await queryRows(
            db,
            `SELECT r.status, r.terminal_reason, r.failure_stage, r.error_message,
                    r.result_markdown, r.warehouse_query_count, r.input_tokens,
                    r.output_tokens, r.total_tokens, r.cache_read_tokens,
                    r.cache_write_tokens, r.reasoning_tokens,
                    r.token_usage_complete, r.duration_ms,
                    (SELECT COUNT(*)::int FROM query_history q
                     WHERE q.context = 'ai' AND q.project_uuid = r.project_uuid
                       AND q.created_by_user_uuid = r.created_by_user_uuid
                       AND q.created_at BETWEEN r.created_at AND r.completed_at
                    ) AS ai_queries
             FROM ai_deep_research_runs r
             WHERE r.ai_deep_research_run_uuid = $1`,
            [runUuid],
            runRowSchema,
        ),
        `ai_deep_research_runs ${runUuid}`,
    );

const firstHeading = (markdown: string) =>
    /^#{1,6}\s+(.+)$/m.exec(markdown)?.[1]?.replace(/[*_`]/g, '').trim() ??
    null;

test('T6.1 Deep research run to a report', async ({
    page,
    api,
    db,
    f1Agent,
}) => {
    await retryOnceOnVariance(async () => {
        const started = await test.step('browser: start research', async () => {
            const created = page.waitForResponse(
                (response) => isPost(researchPath)(response.request()),
                { timeout: 0 },
            );
            await openNewThreadPage(page, f1Agent);
            await composer(page).fill(QUESTION);
            await page
                .getByRole('button', { name: 'Composer options' })
                .click();
            await page
                .getByRole('menuitem', { name: 'Enable deep research' })
                .click();
            // The menu stays open after the toggle.
            await page.keyboard.press('Escape');
            await page.getByRole('button', { name: 'Start research' }).click();
            const response = await created;
            expect(response.status(), 'create run').toBe(202);
            return resultsOf(await replyOfResponse(response), runSchema);
        });
        const runUuid = started.aiDeepResearchRunUuid;

        return withRunCancelledAfter(api, runUuid, async () => {
            const run = await watchRun(api, db, runUuid, (current) =>
                isAiDeepResearchRunTerminal(current.status),
            );
            const row = await readRunRow(db, runUuid);
            reportObservation(
                `run ${run.status} (${row.terminal_reason ?? 'no terminal reason'}), ${row.warehouse_query_count ?? 0} warehouse queries, ${row.duration_ms ?? 0} ms`,
            );
            switch (run.status) {
                case 'completed':
                    expect(
                        row.token_usage_complete,
                        'token_usage_complete',
                    ).toBe(true);
                    break;
                case 'partially_completed':
                    expect(
                        BUDGET_REASONS,
                        'partially_completed needs a budget reason',
                    ).toContain(row.terminal_reason);
                    reportObservation(
                        `partially completed on ${row.terminal_reason}: variance-adjacent, reported`,
                    );
                    break;
                case 'failed':
                case 'cancelled':
                case 'queued':
                case 'running':
                    throw new Error(
                        `Run ${run.status} at ${row.failure_stage ?? 'no stage'} (${row.terminal_reason ?? 'no reason'}): ${row.error_message ?? ''}`,
                    );
                default:
                    return assertUnreachable(run.status, 'Unknown run status');
            }
            if ((row.warehouse_query_count ?? 0) === 0) {
                return {
                    kind: 'variance',
                    assertion: 'the run never queried the warehouse',
                    ledger: row,
                };
            }
            expect(
                row.result_markdown?.trim() ?? '',
                'result_markdown',
            ).not.toBe('');
            expect(
                row.ai_queries,
                "query_history rows with context 'ai'",
            ).toBeGreaterThan(0);
            expect(row.input_tokens ?? 0, 'input_tokens').toBeGreaterThan(0);
            expect(row.output_tokens ?? 0, 'output_tokens').toBeGreaterThan(0);
            expect(
                row.total_tokens ?? 0,
                'total_tokens',
            ).toBeGreaterThanOrEqual(
                (row.input_tokens ?? 0) + (row.output_tokens ?? 0),
            );
            Object.entries({
                cache_read_tokens: row.cache_read_tokens,
                cache_write_tokens: row.cache_write_tokens,
                reasoning_tokens: row.reasoning_tokens,
            }).forEach(([name, value]) => {
                expect(Number.isInteger(value), `${name} is an integer`).toBe(
                    true,
                );
            });
            expect(Number.isInteger(row.duration_ms), 'duration_ms').toBe(true);
            expect(row.duration_ms ?? 0, 'duration_ms').toBeGreaterThan(0);

            await test.step('browser: open the report', async () => {
                await page
                    .locator('[data-tour-anchor="research-report-open"]')
                    .click();
                await page.waitForURL(
                    new RegExp(
                        `/projects/${projectUuid}/ai-agents/deep-research/${runUuid}`,
                    ),
                );
                await expect(
                    page.getByRole('button', { name: 'Back to chat' }),
                ).toBeVisible();
                const heading = firstHeading(row.result_markdown ?? '');
                if (heading !== null) {
                    await expect(
                        page.getByRole('heading', { name: heading }).first(),
                    ).toBeVisible();
                }
            });
            return { kind: 'pass' };
        });
    });
});
