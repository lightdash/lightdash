import {
    AI_DEEP_RESEARCH_RUN_STATUSES,
    AI_DEEP_RESEARCH_TERMINAL_REASONS,
    isAiDeepResearchRunTerminal,
} from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from 'pg';
import { z } from 'zod';
import { projectUuid, type Agent } from './agents';
import type { LightdashApi } from './api';
import { single } from './assert';
import { markUndone, recordUndo } from './cleanupLedger';
import { queryRows } from './db';

export const researchPath = `/api/v1/ee/projects/${projectUuid}/ai-deep-research`;

export const runPath = (runUuid: string) => `${researchPath}/${runUuid}`;

export const runSchema = z.object({
    aiDeepResearchRunUuid: z.string(),
    aiThreadUuid: z.string(),
    promptUuid: z.string(),
    status: z.enum(AI_DEEP_RESEARCH_RUN_STATUSES),
    terminalReason: z.enum(AI_DEEP_RESEARCH_TERMINAL_REASONS).nullable(),
    resultMarkdown: z.string().nullable(),
    errorMessage: z.string().nullable(),
    cancellationRequestedAt: z.string().nullable(),
    updatedAt: z.string(),
});
export type Run = z.output<typeof runSchema>;

/** Starts a run on an unanswered prompt of the agent's thread. */
export const startRun = (
    api: LightdashApi,
    agent: Agent,
    thread: { uuid: string; promptUuid: string; prompt: string },
) =>
    api.send('POST', researchPath, {
        prompt: thread.prompt,
        agentUuid: agent.uuid,
        threadUuid: thread.uuid,
        promptUuid: thread.promptUuid,
        entryPoint: 'ask_ai',
    });

const countEvents = async (db: Pool, runUuid: string) =>
    single(
        await queryRows(
            db,
            `SELECT COUNT(*)::int AS count FROM ai_deep_research_events
             WHERE ai_deep_research_run_uuid = $1`,
            [runUuid],
            z.object({ count: z.number() }),
        ),
        'ai_deep_research_events count',
    ).count;

// AiDeepResearchExecutor bumps updated_at every 15 s while a run executes.
// Five missed beats, with no new event either, means nothing is running it.
const HEARTBEAT_MS = 15_000;
const STALL_WINDOW_MS = 5 * HEARTBEAT_MS;
const POLL_MS = 5_000;

/**
 * Polls the run until `done` holds. Hung, not slow, is the failure: while it
 * polls, updated_at or the event count must advance within every window.
 */
export const watchRun = async (
    api: LightdashApi,
    db: Pool,
    runUuid: string,
    done: (run: Run) => boolean,
) => {
    let lastProgress: { signal: string; seenAt: number } | null = null;
    for (;;) {
        const run = await api.get(runPath(runUuid), runSchema);
        if (done(run)) return run;
        if (isAiDeepResearchRunTerminal(run.status)) {
            throw new Error(
                `Run ended ${run.status} (${run.terminalReason ?? 'no reason'}) before the awaited state: ${run.errorMessage ?? ''}`,
            );
        }
        const signal = `${run.updatedAt}|${await countEvents(db, runUuid)}`;
        if (lastProgress === null || signal !== lastProgress.signal) {
            lastProgress = { signal, seenAt: Date.now() };
        } else if (Date.now() - lastProgress.seenAt > STALL_WINDOW_MS) {
            throw new Error(
                `Run hung: ${run.status} with no heartbeat or event for ${STALL_WINDOW_MS / 1000} s`,
            );
        }
        await sleep(POLL_MS);
    }
};

/**
 * Runs `fn` for a started run, then cancels the run if it is still active;
 * the cancel is in the kill-safe ledger. Deleting the fixture agent removes
 * the run's rows.
 */
export const withRunCancelledAfter = async <T>(
    api: LightdashApi,
    runUuid: string,
    fn: () => Promise<T>,
): Promise<T> => {
    const cancelPath = `${runPath(runUuid)}/cancel`;
    const undo = recordUndo({ kind: 'http', method: 'POST', path: cancelPath });
    try {
        return await fn();
    } finally {
        const { status } = await api.get(runPath(runUuid), runSchema);
        if (!isAiDeepResearchRunTerminal(status)) {
            await api.send('POST', cancelPath);
        }
        markUndone(undo);
    }
};
