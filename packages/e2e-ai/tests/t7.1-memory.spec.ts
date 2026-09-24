import {
    assertUnreachable,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
} from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createTrackedAgent, projectUuid, type Agent } from '../lib/agents';
import type { LightdashApi } from '../lib/api';
import { single } from '../lib/assert';
import { markUndone, recordUndo, type Undo } from '../lib/cleanupLedger';
import { queryRows } from '../lib/db';
import { optInEnabled, runId } from '../lib/env';
import { f1MemoryAgent } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import {
    reportObservation,
    reportSkippedCheck,
    reportWarning,
} from '../lib/report';
import { createThread, generateAnswer } from '../lib/threads';
import {
    jsonLogMessagesSince,
    markUsageLog,
    type UsageLogMark,
} from '../lib/usageLog';
import { waitFor } from '../lib/wait';

// Plan T7.1 (V, O). Memory is off for every organization and has no toggle,
// so the test turns it on for the seed org by SQL, as the plan prescribes,
// and restores it. A distill that makes no memory once is variance; twice is
// reported as a coverage gap. A failed distill is real, and so is a recall
// thread whose first message lacks the memory (read from the debug log). Its
// cited and pulled counts depend on the model and are reported; pulled only
// counts the optional loadProjectContext search, so a healthy recall can
// leave it at 0 (see the README finding).

const PREFERENCE =
    "For all my questions, treat the payments explore as the source of truth for revenue and call payment_method 'channel'. Now, how many orders are there?";
const RECALL = 'What is revenue by channel?';
// A distill job the scheduler has not claimed by then has no worker.
const CLAIM_WINDOW_MS = 60_000;

const SET_MEMORY_ENABLED =
    'UPDATE organizations SET ai_agent_memory_enabled = $2 WHERE organization_uuid = $1';
// Memories outlive their agent and source thread.
const DELETE_MEMORIES =
    'DELETE FROM ai_agent_memory WHERE source_thread_uuid = $1';

const memorySchema = z.object({
    ai_agent_memory_uuid: z.string(),
    slug: z.string(),
    title: z.string(),
    status: z.string(),
    terms: z.array(z.unknown()),
    objects: z.array(z.unknown()),
    pulled_count: z.number(),
    last_pulled_at: z.date().nullable(),
    cited_count: z.number(),
});

const readActiveMemories = (db: Pool, sourceThreadUuid: string) =>
    queryRows(
        db,
        `SELECT ai_agent_memory_uuid, slug, title, status, terms, objects,
                pulled_count, last_pulled_at, cited_count
         FROM ai_agent_memory
         WHERE source_thread_uuid = $1 AND status = 'active'`,
        [sourceThreadUuid],
        memorySchema,
    );

// agentV2 getMemoryBlock renders every active memory into the first user
// message; the debug agent-message log line is the only record of it.
const AGENT_USER_MESSAGE = '[AiAgent][Agent Messages] user message:';

/** The product's injection, asserted from the backend log when it can be. */
const checkMemoryInjected = async (mark: UsageLogMark, slug: string) => {
    switch (mark.kind) {
        case 'unset':
            reportSkippedCheck(
                'memory injection',
                'E2E_AI_BACKEND_LOG is unset, so the <ld-memories> block cannot be read',
            );
            return;
        case 'marked': {
            // The line is written before the answer returns; this only waits
            // for the log to flush.
            const messages = await waitFor(
                async () =>
                    (await jsonLogMessagesSince(mark)).filter((message) =>
                        message.startsWith(AGENT_USER_MESSAGE),
                    ),
                (found) => found.length > 0,
                10_000,
            );
            if (messages.length === 0) {
                reportSkippedCheck(
                    'memory injection',
                    'the backend log has no debug agent-message lines, so its level is above debug',
                );
                return;
            }
            expect(
                messages.some(
                    (message) =>
                        message.includes('<ld-memories>') &&
                        message.includes(slug),
                ),
                `an <ld-memories> block carrying ${slug} in the recall thread`,
            ).toBe(true);
            return;
        }
        default:
            assertUnreachable(mark, 'Unknown usage log mark');
    }
};

/**
 * Runs `fn` with the admin's memories-tour state put back afterwards: the
 * tour's Skip writes user_onboarding, which is shared with the real user.
 */
const withMemoryTourRestored = async (
    db: Pool,
    fn: (tourCompleted: boolean) => Promise<void>,
) => {
    const user = SEED_ORG_1_ADMIN.user_uuid;
    const [row] = await queryRows(
        db,
        'SELECT completed_tours FROM user_onboarding WHERE user_uuid = $1',
        [user],
        z.object({ completed_tours: z.record(z.string(), z.unknown()) }),
    );
    const restore: Undo =
        row === undefined
            ? {
                  kind: 'sql',
                  text: 'DELETE FROM user_onboarding WHERE user_uuid = $1',
                  params: [user],
              }
            : {
                  kind: 'sql',
                  text: 'UPDATE user_onboarding SET completed_tours = $2::jsonb WHERE user_uuid = $1',
                  params: [user, JSON.stringify(row.completed_tours)],
              };
    const undo = recordUndo(restore);
    try {
        await fn(row?.completed_tours.memoryTour === true);
    } finally {
        await db.query(restore.text, restore.params);
        markUndone(undo);
    }
};

/** Runs `fn` with memory on for the seed org; the restore is kill-safe. */
const withMemoryEnabled = async (db: Pool, fn: () => Promise<void>) => {
    const org = SEED_ORG_1.organization_uuid;
    const [row] = await queryRows(
        db,
        'SELECT ai_agent_memory_enabled FROM organizations WHERE organization_uuid = $1',
        [org],
        z.object({ ai_agent_memory_enabled: z.boolean().nullable() }),
    );
    const previous = String(row?.ai_agent_memory_enabled ?? false);
    const undo = recordUndo({
        kind: 'sql',
        text: SET_MEMORY_ENABLED,
        params: [org, previous],
    });
    await db.query(SET_MEMORY_ENABLED, [org, 'true']);
    try {
        await fn();
    } finally {
        await db.query(SET_MEMORY_ENABLED, [org, previous]);
        markUndone(undo);
    }
};

/** Waits for the thread's distill job to be claimed and to finish. */
const awaitDistillJob = async (db: Pool, threadUuid: string) => {
    const queuedAt = Date.now();
    for (;;) {
        const jobs = await queryRows(
            db,
            `SELECT locked_at, last_error FROM graphile_worker.jobs
             WHERE task_identifier = 'aiAgentMemoryDistill'
               AND payload->>'threadUuid' = $1`,
            [threadUuid],
            z.object({
                locked_at: z.date().nullable(),
                last_error: z.string().nullable(),
            }),
        );
        if (jobs.length === 0) return;
        const failed = jobs.find((job) => job.last_error !== null);
        if (failed !== undefined) {
            throw new Error(`The distill job failed: ${failed.last_error}`);
        }
        if (
            jobs.every((job) => job.locked_at === null) &&
            Date.now() - queuedAt > CLAIM_WINDOW_MS
        ) {
            throw new Error(
                `No scheduler worker claimed the distill job within ${CLAIM_WINDOW_MS / 1000} s`,
            );
        }
        await sleep(1_000);
    }
};

/**
 * One source thread, answered, then distilled by hand. Registers the
 * thread's memories for cleanup before anything can create one.
 */
const distillThread = async (
    api: LightdashApi,
    db: Pool,
    agent: Agent,
    cleanups: { threadUuid: string; undo: string }[],
) => {
    const thread = await createThread(api, agent, PREFERENCE);
    cleanups.push({
        threadUuid: thread.uuid,
        undo: recordUndo({
            kind: 'sql',
            text: DELETE_MEMORIES,
            params: [thread.uuid],
        }),
    });
    await generateAnswer(api, agent, thread.uuid);
    const trigger = await api.send(
        'POST',
        `/api/v1/projects/${projectUuid}/aiAgentMemories/threads/${thread.uuid}/distill`,
    );
    expect(trigger.status, `distill trigger: ${trigger.text}`).toBe(202);
    await awaitDistillJob(db, thread.uuid);
    const distill = single(
        await queryRows(
            db,
            `SELECT outcome, no_op_reason, error_message
             FROM ai_agent_thread_distill WHERE ai_thread_uuid = $1`,
            [thread.uuid],
            z.object({
                outcome: z.enum(['memory', 'no_op', 'skipped', 'failed']),
                no_op_reason: z.string().nullable(),
                error_message: z.string().nullable(),
            }),
        ),
        `distill outcome for thread ${thread.uuid} (none means the job never reached the ledger)`,
    );
    return { threadUuid: thread.uuid, distill };
};

/** Plan: no_op once is variance, twice a coverage gap. */
const distillToMemory = async (
    api: LightdashApi,
    db: Pool,
    agent: Agent,
    cleanups: { threadUuid: string; undo: string }[],
) => {
    for (const attempt of [1, 2]) {
        const { threadUuid, distill } = await distillThread(
            api,
            db,
            agent,
            cleanups,
        );
        switch (distill.outcome) {
            case 'failed':
                throw new Error(`Distill failed: ${distill.error_message}`);
            case 'memory':
                return {
                    threadUuid,
                    memory: single(
                        await readActiveMemories(db, threadUuid),
                        `active memory from thread ${threadUuid}`,
                    ),
                };
            case 'no_op':
            case 'skipped':
                reportObservation(
                    `attempt ${attempt}: distill ${distill.outcome}${distill.no_op_reason === null ? '' : ` (${distill.no_op_reason})`}`,
                );
                break;
            default:
                return assertUnreachable(
                    distill.outcome,
                    'Unknown distill outcome',
                );
        }
    }
    return null;
};

test.skip(
    !optInEnabled,
    'opt-in (O): set E2E_AI_OPT_IN=1; the test turns agent memory on for the seed org by SQL and restores it',
);

test('T7.1 Memory: distill, then recall', async ({ page, api, db }) => {
    const tracked = await createTrackedAgent(api, f1MemoryAgent(runId));
    const cleanups: { threadUuid: string; undo: string }[] = [];
    try {
        await withMemoryEnabled(db, async () => {
            const source = await distillToMemory(
                api,
                db,
                tracked.agent,
                cleanups,
            );
            if (source === null) {
                reportWarning(
                    'coverage gap: distill made no memory twice from an explicit preference, so recall was not exercised',
                );
                return;
            }
            const { memory } = source;
            expect(memory.terms.length, 'memory terms').toBeGreaterThan(0);
            expect(memory.objects.length, 'memory objects').toBeGreaterThan(0);

            const recall = await createThread(api, tracked.agent, RECALL);
            // A distill sweep could make a memory of this thread too.
            cleanups.push({
                threadUuid: recall.uuid,
                undo: recordUndo({
                    kind: 'sql',
                    text: DELETE_MEMORIES,
                    params: [recall.uuid],
                }),
            });
            const mark = await markUsageLog();
            await generateAnswer(api, tracked.agent, recall.uuid);
            await checkMemoryInjected(mark, memory.slug);

            // Both depend on what the model does with the injected memory:
            // cited is its <ld-mem-cite> marker, pulled only counts memories
            // the optional loadProjectContext search returns.
            // Citations are counted once the answer is stored.
            const used = await waitFor(
                async () =>
                    single(
                        await readActiveMemories(db, source.threadUuid),
                        'active memory',
                    ),
                (row) => row.cited_count + row.pulled_count > 0,
                30_000,
            );
            reportObservation(
                `memory cited ${used.cited_count} time(s), pulled ${used.pulled_count} time(s)`,
            );
            if (used.cited_count + used.pulled_count === 0) {
                reportWarning(
                    'the model neither cited nor pulled the injected memory in the recall thread (model-dependent)',
                );
            }

            await withMemoryTourRestored(db, async (tourCompleted) => {
                await page.goto(
                    `/projects/${projectUuid}/ai-agents/${tracked.agent.uuid}/threads/${recall.uuid}`,
                );
                // The once-per-user memories tour blocks the page until it
                // is dismissed.
                if (!tourCompleted) {
                    await page.getByRole('button', { name: 'Skip' }).click();
                }
                await page.getByRole('button', { name: 'Memories' }).click();
                await expect(
                    page
                        .getByRole('dialog')
                        .filter({ hasText: 'My memories' })
                        .getByText(memory.title, { exact: true })
                        .first(),
                    'memory listed in My memories',
                ).toBeVisible();
            });
        });
    } finally {
        for (const { threadUuid, undo } of cleanups) {
            await db.query(DELETE_MEMORIES, [threadUuid]);
            markUndone(undo);
        }
        await tracked.remove();
    }
});
