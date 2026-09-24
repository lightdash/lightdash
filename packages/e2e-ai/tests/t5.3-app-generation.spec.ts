import { APP_VERSION_STAGE_ORDER, assertUnreachable } from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from 'pg';
import type { Page } from 'playwright/test';
import { z } from 'zod';
import { createTrackedAgent, projectUuid } from '../lib/agents';
import { askInNewThread, assistantBubbles } from '../lib/agentUi';
import type { LightdashApi } from '../lib/api';
import { single } from '../lib/assert';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { requireAppRuntime, requireDataApps } from '../lib/dataApps';
import { queryRows } from '../lib/db';
import { optInEnabled, runId } from '../lib/env';
import { f1DataAppAgent } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { readPromptLedger } from '../lib/ledger';
import { reportObservation } from '../lib/report';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T5.3 (O). V only on whether the agent calls generateDataApp; a build
// that ends in error is real. Preconditions: E2E_AI_OPT_IN=1, data apps on,
// the app runtime mounted, and a sandbox the backend can start
// (SANDBOX_PROVIDER=docker locally), which no endpoint reports, so the
// opt-in stands for it. The agent is F1 with content tools on, created only
// once every check has passed. NOT YET VERIFIED LIVE.

const PROMPT = 'Build a small data app that shows orders by status';
// The pipeline heartbeats status_updated_at every minute while it runs, and
// its stale-lock sweeper treats five minutes without an update as dead.
const STALL_WINDOW_MS = 5 * 60 * 1000;
const POLL_MS = 5_000;

const appsPath = `/api/v1/ee/projects/${projectUuid}/apps`;

// generateDataApp's result: pending while the build runs, then patched to
// success or error once the version is terminal.
const buildResultSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('pending'),
        appUuid: z.string(),
        version: z.number(),
    }),
    z.object({
        status: z.literal('success'),
        appUuid: z.string(),
        version: z.number(),
    }),
    z.object({
        status: z.literal('error'),
        appUuid: z.string().nullable(),
        message: z.string(),
    }),
]);

const versionRowSchema = z.object({
    status: z.string(),
    status_message: z.string().nullable(),
    error: z.string().nullable(),
    status_updated_at: z.date().nullable(),
    status_history: z.array(
        z.object({ kind: z.string(), timestamp: z.string() }),
    ),
    creation_experience: z.string().nullable(),
    ai_thread_uuid: z.string().nullable(),
});
type VersionRow = z.output<typeof versionRowSchema>;

const readVersion = async (db: Pool, appUuid: string, version: number) =>
    single(
        await queryRows(
            db,
            `SELECT v.status, v.status_message, v.error, v.status_updated_at,
                    v.status_history,
                    v.resources->>'creationExperience' AS creation_experience,
                    t.ai_thread_uuid
             FROM app_versions v
             LEFT JOIN app_threads t ON t.app_thread_uuid = v.app_thread_uuid
             WHERE v.app_id = $1 AND v.version = $2`,
            [appUuid, version],
            versionRowSchema,
        ),
        `app_versions ${appUuid} v${version}`,
    );

const isTerminal = (status: string) => status === 'ready' || status === 'error';

/**
 * Polls the version to a terminal status. Hung, not slow, is the failure:
 * status_updated_at must change within every stall window.
 */
const watchBuild = async (db: Pool, appUuid: string, version: number) => {
    const statuses: string[] = [];
    let lastUpdate: { at: number | null; seenAt: number } | null = null;
    for (;;) {
        const row = await readVersion(db, appUuid, version);
        if (statuses.at(-1) !== row.status) statuses.push(row.status);
        if (isTerminal(row.status)) return { row, statuses };
        const at = row.status_updated_at?.getTime() ?? null;
        if (lastUpdate === null || at !== lastUpdate.at) {
            lastUpdate = { at, seenAt: Date.now() };
        } else if (Date.now() - lastUpdate.seenAt > STALL_WINDOW_MS) {
            throw new Error(
                `Build hung: ${row.status} ("${row.status_message}") has not progressed for ${STALL_WINDOW_MS / 60_000} minutes`,
            );
        }
        await sleep(POLL_MS);
    }
};

const checkStageOrder = (statuses: string[], row: VersionRow) => {
    const stageOrder: readonly string[] = APP_VERSION_STAGE_ORDER;
    const indexes = statuses.map((status) => stageOrder.indexOf(status));
    expect(indexes, `observed statuses ${statuses.join(' > ')}`).not.toContain(
        -1,
    );
    indexes.slice(1).forEach((index, position) => {
        expect(index, `stage order ${statuses.join(' > ')}`).toBeGreaterThan(
            indexes[position] ?? -1,
        );
    });
    const stages = row.status_history.filter((entry) => entry.kind === 'stage');
    expect(stages.length, 'stage entries in status_history').toBeGreaterThan(0);
    const times = row.status_history.map((entry) =>
        Date.parse(entry.timestamp),
    );
    expect(times, 'status_history timestamps in order').toEqual(
        [...times].sort((a, b) => a - b),
    );
    reportObservation(`build statuses observed: ${statuses.join(' > ')}`);
};

/**
 * Follows a started build to ready and opens it, then cancels it if still
 * running and deletes the app; both undos are in the kill-safe ledger.
 */
const followBuild = async ({
    page,
    api,
    db,
    threadUuid,
    promptUuid,
    appUuid,
    version,
}: {
    page: Page;
    api: LightdashApi;
    db: Pool;
    threadUuid: string;
    promptUuid: string;
    appUuid: string;
    version: number;
}) => {
    const appPath = `${appsPath}/${appUuid}`;
    const cancelPath = `${appPath}/versions/${version}/cancel`;
    const deleteApp = recordUndo({
        kind: 'http',
        method: 'DELETE',
        path: appPath,
    });
    // Recorded after the delete, so a sweep replays it first.
    const cancelBuild = recordUndo({
        kind: 'http',
        method: 'POST',
        path: cancelPath,
    });
    try {
        const first = await readVersion(db, appUuid, version);
        expect(first.creation_experience, 'creation experience').toBe(
            'ai_agent',
        );
        expect(first.ai_thread_uuid, 'app thread').toBe(threadUuid);

        const { row, statuses } = await watchBuild(db, appUuid, version);
        if (row.status === 'error') {
            throw new Error(
                `The build ended in error after ${statuses.join(' > ')}: ${row.error ?? row.status_message}`,
            );
        }
        checkStageOrder(statuses, row);
        await expect
            .poll(
                async () =>
                    (await readPromptLedger(db, promptUuid)).toolResults.find(
                        (result) => result.tool_name === 'generateDataApp',
                    )?.metadata?.status,
                { message: 'generateDataApp result after the build' },
            )
            .toBe('success');

        // The build card offers View only once the version is ready.
        await assistantBubbles(page)
            .last()
            .getByRole('button', { name: 'View', exact: true })
            .click();
        const preview = page.locator('iframe[data-tour-scope="view:DataApp"]');
        // Hidden until the iframe's load event for its current src.
        await expect(preview, 'app preview loaded').toBeVisible();
        await expect(preview).toHaveAttribute(
            'src',
            new RegExp(`/api/apps/${appUuid}/versions/${version}/t/`),
        );
    } finally {
        if (!isTerminal((await readVersion(db, appUuid, version)).status)) {
            await api.send('POST', cancelPath);
        }
        markUndone(cancelBuild);
        await api.delete(appPath);
        markUndone(deleteApp);
    }
};

test.skip(
    !optInEnabled,
    'opt-in (O): set E2E_AI_OPT_IN=1 once the backend can start a data app sandbox (SANDBOX_PROVIDER=docker) with app-runtime S3',
);

test('T5.3 Data app generation from Ask AI', async ({ page, api, db }) => {
    await requireDataApps(api);
    await requireAppRuntime(api);
    // generateDataApp is offered only to agents with content tools on.
    const tracked = await createTrackedAgent(api, f1DataAppAgent(runId));
    try {
        await retryOnceOnVariance(async () => {
            const { thread } = await askInNewThread(
                page,
                tracked.agent,
                PROMPT,
            );
            const ledger = await readPromptLedger(db, thread.firstMessage.uuid);
            expect(
                ledger.prompt.error_message,
                'ai_prompt.error_message',
            ).toBeNull();
            // A schema rejection is our tool contract being wrong (plan §5).
            expect(ledger.toolCallErrors, 'tool call schema errors').toEqual(
                [],
            );
            const recovered = ledger.toolResults.filter(
                (row) =>
                    row.tool_name !== 'generateDataApp' &&
                    row.metadata?.status === 'error',
            );
            reportObservation(
                `${recovered.length} recovered tool error(s)${recovered.map((row) => `; ${row.tool_name}: ${row.result}`).join('')}`,
            );
            const starts = ledger.toolResults.filter(
                (row) => row.tool_name === 'generateDataApp',
            );
            if (starts.length === 0) {
                return {
                    kind: 'variance',
                    assertion:
                        'no generateDataApp call: the agent may have asked or answered instead',
                    ledger,
                };
            }
            const start = buildResultSchema.parse(
                single(starts, 'generateDataApp result').metadata,
            );
            switch (start.status) {
                case 'error':
                    if (start.appUuid !== null) {
                        await api.delete(`${appsPath}/${start.appUuid}`);
                    }
                    throw new Error(
                        `generateDataApp reported an error: ${start.message}`,
                    );
                case 'pending':
                case 'success':
                    await followBuild({
                        page,
                        api,
                        db,
                        threadUuid: thread.uuid,
                        promptUuid: thread.firstMessage.uuid,
                        appUuid: start.appUuid,
                        version: start.version,
                    });
                    return { kind: 'pass' };
                default:
                    return assertUnreachable(
                        start,
                        'Unknown generateDataApp status',
                    );
            }
        });
    } finally {
        await tracked.remove();
    }
});
