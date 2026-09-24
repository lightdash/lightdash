import { SEED_ORG_1_ADMIN } from '@lightdash/common';
import { z } from 'zod';
import {
    composer,
    isThreadPost,
    openNewThreadPage,
    workingIndicator,
} from '../lib/agentUi';
import { replyOfResponse, resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { queryRows } from '../lib/db';
import { expect, test } from '../lib/fixtures';
import { readPromptLedger } from '../lib/ledger';
import { threadSummarySchema } from '../lib/threads';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T2.5. Deterministic, except that a turn finishing before the click
// is retried once with a longer prompt; any hang or error is real.
// Preconditions: F1. The agent stops at its next step boundary: the interrupt
// is a row the stopWhen check reads (agentV2.ts), not an aborted request.

const PROMPTS = {
    1: 'Which customer placed the most orders, and list their orders one by one with dates?',
    2: 'Which customer placed the most orders, and list their orders one by one with dates? Then do the same for the second and third customers, and summarise how the three differ in a table.',
};

test('T2.5 Interrupt a running turn', async ({ page, db, f1Agent }) => {
    await retryOnceOnVariance(async (attemptNumber) => {
        const threadCreated = page.waitForResponse(isThreadPost(f1Agent, ''));
        const streamed = page.waitForResponse(isThreadPost(f1Agent, '/stream'));
        await openNewThreadPage(page, f1Agent);
        await composer(page).fill(PROMPTS[attemptNumber]);
        await page.getByRole('button', { name: 'Send message' }).click();
        await expect(workingIndicator(page).first()).toBeVisible();
        const thread = resultsOf(
            await replyOfResponse(await threadCreated),
            threadSummarySchema,
        );
        const promptUuid = thread.firstMessage.uuid;

        const interrupted = page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname.endsWith(
                    `/messages/${promptUuid}/interrupt`,
                ),
        );
        const clickedAt = new Date();
        await page.getByRole('button', { name: 'Stop agent' }).click();
        expect((await interrupted).status(), 'interrupt status').toBe(200);

        await (await streamed).finished();
        await expect(workingIndicator(page)).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: 'Send message' }),
        ).toBeVisible();

        const interrupt = single(
            await queryRows(
                db,
                'SELECT created_by_user_uuid FROM ai_prompt_interrupt WHERE ai_prompt_uuid = $1',
                [promptUuid],
                z.object({ created_by_user_uuid: z.string().nullable() }),
            ),
            'ai_prompt_interrupt row',
        );
        expect(interrupt.created_by_user_uuid).toBe(SEED_ORG_1_ADMIN.user_uuid);

        const ledger = await readPromptLedger(db, promptUuid);
        // No interrupt marker exists: an interrupted turn keeps error_message
        // null, so any value here is a real error.
        expect(
            ledger.prompt.error_message,
            'ai_prompt.error_message',
        ).toBeNull();
        const respondedAt = ledger.prompt.responded_at;
        if (respondedAt === null)
            throw new Error('ai_prompt.responded_at is null');
        // Second resolution: the column holds a local timestamp.
        if (respondedAt.getTime() < clickedAt.getTime() - 1000) {
            return {
                kind: 'variance',
                assertion: 'the turn finished before the interrupt click',
                ledger,
            };
        }
        return { kind: 'pass' };
    });
});
