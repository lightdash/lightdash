import { assertUnreachable } from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import type { LightdashApi } from '../lib/api';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { queryRows } from '../lib/db';
import { optInEnabled } from '../lib/env';
import { expect, test } from '../lib/fixtures';
import { isFeatureFlagEnabled } from '../lib/flags';
import { reportObservation } from '../lib/report';
import {
    equals,
    expectUsageLine,
    markUsageLog,
    usageValue,
    witnessUsage,
} from '../lib/usageLog';

// Plan T8.2 (O). An error status is real; an empty action list is variance
// and expected on a clean seed. Aggression only removes cleanup tools:
// creating content and fixing broken charts are separate capabilities, on by
// default, so the run also turns off createContent and modifyExistingContent
// to leave seed content alone. Everything the test creates is removed
// afterwards: the settings row (when there was none), the run, and its
// actions.

const basePath = `/api/v1/projects/${projectUuid}/managed-agent`;
// A run the scheduler has not started by then has no worker to run it.
const START_WINDOW_MS = 60_000;

const DELETE_RUN =
    'DELETE FROM managed_agent_runs WHERE managed_agent_run_uuid = $1';
const DELETE_RUN_ACTIONS =
    'DELETE FROM managed_agent_actions WHERE managed_agent_run_uuid = $1';

const runSchema = z.object({
    runUuid: z.string(),
    triggeredBy: z.enum(['cron', 'manual', 'on_enable']),
    status: z.enum(['started', 'completed', 'error']),
    summary: z.string().nullable(),
    error: z.string().nullable(),
    actionCount: z.number(),
});
type Run = z.output<typeof runSchema>;

const actionSchema = z.object({
    actionUuid: z.string(),
    actionType: z.string(),
    targetType: z.string(),
    targetUuid: z.string(),
    targetName: z.string(),
    reversedAt: z.string().nullable(),
});

const latestRun = (api: LightdashApi) =>
    api.get(`${basePath}/runs/latest`, runSchema.nullable());

/** Waits for a run other than `previous` to start. */
const awaitNewRun = async (api: LightdashApi, previous: string | null) => {
    const enabledAt = Date.now();
    for (;;) {
        const run = await latestRun(api);
        if (run !== null && run.runUuid !== previous) return run;
        if (Date.now() - enabledAt > START_WINDOW_MS) {
            throw new Error(
                `No autopilot run started within ${START_WINDOW_MS / 1000} s of enabling it`,
            );
        }
        await sleep(1_000);
    }
};

/**
 * Polls the run to a terminal status. Runs have no heartbeat; the product
 * itself reads a run as error 15 minutes after it started, which bounds this.
 */
const awaitTerminal = async (api: LightdashApi, runUuid: string) => {
    for (;;) {
        const run = await latestRun(api);
        if (run === null || run.runUuid !== runUuid) {
            throw new Error(`Run ${runUuid} is no longer the latest run`);
        }
        if (run.status !== 'started') return run;
        await sleep(2_000);
    }
};

const checkRun = (run: Run) => {
    switch (run.status) {
        case 'completed':
            return;
        case 'error':
        case 'started':
            throw new Error(`Autopilot run ${run.status}: ${run.error ?? ''}`);
        default:
            return assertUnreachable(
                run.status,
                'Unknown autopilot run status',
            );
    }
};

test.skip(
    !optInEnabled,
    'opt-in (O): set E2E_AI_OPT_IN=1; the test enables autopilot on the seed project without its content tools and removes everything it created',
);

test('T8.2 Autopilot heartbeat', async ({ api, db }) => {
    // Without it the heartbeat job skips silently and no run ever starts.
    test.skip(
        !(await isFeatureFlagEnabled(api, 'ai-autopilot')),
        'autopilot is off: enable the ai-autopilot feature flag',
    );
    const previousSettings = await api.get(
        `${basePath}/settings`,
        z.looseObject({ enabled: z.boolean() }).nullable(),
    );
    test.skip(
        previousSettings !== null,
        'autopilot is already configured for the seed project; the test only runs where it can remove every trace',
    );
    const previousRun = await latestRun(api);
    // Replayed newest first by a sweep: disable (cancels the cron) before
    // the row goes.
    const deleteSettings = recordUndo({
        kind: 'sql',
        text: 'DELETE FROM managed_agent_settings WHERE project_uuid = $1',
        params: [projectUuid],
    });
    const disable = recordUndo({
        kind: 'http',
        method: 'PATCH',
        path: `${basePath}/settings`,
        body: { enabled: false },
    });
    const runCleanups: { runUuid: string; undos: string[] }[] = [];
    const mark = await markUsageLog();
    try {
        // Enabling starts an on_enable run by itself.
        await api.patch(
            `${basePath}/settings`,
            {
                enabled: true,
                policy: { aggression: 'flag' },
                toolSettings: {
                    createContent: false,
                    modifyExistingContent: false,
                },
            },
            z.unknown(),
        );
        const started = await awaitNewRun(api, previousRun?.runUuid ?? null);
        runCleanups.push({
            runUuid: started.runUuid,
            // Recorded run first, so a sweep removes the actions before it.
            undos: [DELETE_RUN, DELETE_RUN_ACTIONS].map((text) =>
                recordUndo({ kind: 'sql', text, params: [started.runUuid] }),
            ),
        });
        reportObservation(
            `run ${started.runUuid} triggered by ${started.triggeredBy}`,
        );

        // The manual trigger refuses while that run is live.
        if (started.status === 'started') {
            const manual = await api.send('POST', `${basePath}/run`);
            expect(
                manual.status,
                `manual run while one is live: ${manual.text}`,
            ).toBe(409);
        }

        const run = await awaitTerminal(api, started.runUuid);
        checkRun(run);
        expect(run.summary?.trim() ?? '', 'run narrative').not.toBe('');

        const actions = await api.get(
            `${basePath}/actions?runUuid=${run.runUuid}`,
            z.array(actionSchema),
        );
        reportObservation(
            `${actions.length} action(s): ${actions.map((action) => action.actionType).join(', ') || 'none (expected on a clean seed)'}`,
        );
        for (const action of actions) {
            expect(
                action.targetUuid,
                `action ${action.actionUuid} target`,
            ).not.toBe('');
            expect(
                action.targetName,
                `action ${action.actionUuid} target name`,
            ).not.toBe('');
            const reversed = await api.post(
                `${basePath}/actions/${action.actionUuid}/reverse`,
                {},
                actionSchema,
            );
            expect(
                reversed.reversedAt,
                `action ${action.actionUuid} reversed`,
            ).not.toBeNull();
        }

        await witnessUsage(
            mark,
            'autopilot attribution',
            (usage) =>
                usageValue(usage, 'feature') === 'managed-agent' &&
                usageValue(usage, 'managedAgentRunId') === run.runUuid,
            (lines) =>
                lines.forEach((line) =>
                    expectUsageLine(line, {
                        projectId: equals(projectUuid),
                    }),
                ),
        );
    } finally {
        await api.patch(
            `${basePath}/settings`,
            { enabled: false },
            z.unknown(),
        );
        markUndone(disable);
        for (const { runUuid, undos } of runCleanups) {
            await db.query(DELETE_RUN_ACTIONS, [runUuid]);
            await db.query(DELETE_RUN, [runUuid]);
            undos.forEach(markUndone);
        }
        await db.query(
            'DELETE FROM managed_agent_settings WHERE project_uuid = $1',
            [projectUuid],
        );
        markUndone(deleteSettings);
    }
    expect(
        await queryRows(
            db,
            'SELECT project_uuid FROM managed_agent_settings WHERE project_uuid = $1',
            [projectUuid],
            z.object({ project_uuid: z.string() }),
        ),
        'settings row removed',
    ).toEqual([]);
});
