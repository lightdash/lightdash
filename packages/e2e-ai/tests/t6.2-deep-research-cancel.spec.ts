import { z } from 'zod';
import { resultsOf } from '../lib/api';
import {
    runPath,
    runSchema,
    startRun,
    watchRun,
    withRunCancelledAfter,
} from '../lib/deepResearch';
import { expect, test } from '../lib/fixtures';
import { reportObservation } from '../lib/report';
import { createThread, threadPath } from '../lib/threads';

// Plan T6.2. Deterministic. Preconditions: F1. A run is started on a thread
// prompt nobody answers, which is how the web app starts one.

const QUESTION = 'Why do some order statuses have more orders than others?';
const SECOND_QUESTION = 'Which customers placed the most orders last month?';

test('T6.2 Cancel a deep research run', async ({ api, db, f1Agent }) => {
    const thread = await createThread(api, f1Agent, QUESTION);
    const created = await startRun(api, f1Agent, {
        uuid: thread.uuid,
        promptUuid: thread.firstMessage.uuid,
        prompt: QUESTION,
    });
    expect(created.status, created.text).toBe(202);
    const runUuid = resultsOf(created, runSchema).aiDeepResearchRunUuid;

    await withRunCancelledAfter(api, runUuid, async () => {
        // The guard is per thread, so the second run needs its own prompt.
        const second = await api.post(
            `${threadPath(f1Agent, thread.uuid)}/messages`,
            { prompt: SECOND_QUESTION },
            z.object({ uuid: z.string() }),
        );
        const conflict = await startRun(api, f1Agent, {
            uuid: thread.uuid,
            promptUuid: second.uuid,
            prompt: SECOND_QUESTION,
        });
        expect(conflict.status, `second run: ${conflict.text}`).toBe(409);

        await watchRun(api, db, runUuid, (run) => run.status === 'running');
        const requested = await api.post(
            `${runPath(runUuid)}/cancel`,
            {},
            runSchema,
        );
        expect(
            requested.cancellationRequestedAt,
            'cancel request',
        ).not.toBeNull();

        const run = await watchRun(
            api,
            db,
            runUuid,
            (current) => current.status === 'cancelled',
        );
        expect(
            run.cancellationRequestedAt,
            'cancellation_requested_at',
        ).not.toBeNull();
        reportObservation(
            `cancelled with terminal reason ${run.terminalReason ?? 'none'}`,
        );
    });
});
