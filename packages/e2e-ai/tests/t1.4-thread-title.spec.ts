import type { Pool } from 'pg';
import { z } from 'zod';
import {
    isThreadPost,
    openNewThreadPage,
    sendPrompt,
    sidebarThreadTitles,
} from '../lib/agentUi';
import { replyOfResponse, resultsOf, type ApiReply } from '../lib/api';
import { single } from '../lib/assert';
import { queryRows } from '../lib/db';
import { WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { createThread, threadPath, threadSummarySchema } from '../lib/threads';

// Plan T1.4. Deterministic. The title call runs on the fast model with the
// thread's messages and a closing user turn; a provider that rejects an
// assistant-final structured-output prompt fails it. The service turns any
// failure into HTTP 500 "Failed to generate thread title" and logs the cause.
// Preconditions: F1.

// titleGenerator.ts
const titleSchema = z.object({
    title: z
        .string()
        .min(1)
        .max(60)
        .refine((title) => title !== 'Untitled thread'),
});

const expectTitle = async (db: Pool, threadUuid: string, reply: ApiReply) => {
    expect(reply.status, reply.text).toBe(200);
    const { title } = resultsOf(reply, titleSchema);
    const row = single(
        await queryRows(
            db,
            'SELECT title, title_generated_at FROM ai_thread WHERE ai_thread_uuid = $1',
            [threadUuid],
            z.object({
                title: z.string().nullable(),
                title_generated_at: z.date().nullable(),
            }),
        ),
        'ai_thread row',
    );
    expect(row.title, 'ai_thread.title').toBe(title);
    expect(
        row.title_generated_at,
        'ai_thread.title_generated_at',
    ).not.toBeNull();
    return title;
};

test('T1.4 Thread title', async ({ page, api, db, f1Agent }) => {
    const answeredThreadUuid =
        await test.step('browser: the title lands in the DB and the sidebar', async () => {
            const threadCreated = page.waitForResponse(
                isThreadPost(f1Agent, ''),
            );
            const titleGenerated = page.waitForResponse(
                isThreadPost(f1Agent, '/generate-title'),
            );
            const streamed = page.waitForResponse(
                isThreadPost(f1Agent, '/stream'),
            );

            await openNewThreadPage(page, f1Agent);
            await sendPrompt(page, WITNESS_PROMPTS.totalOrders);

            const thread = resultsOf(
                await replyOfResponse(await threadCreated),
                threadSummarySchema,
            );
            const titleResponse = await titleGenerated;
            expect(new URL(titleResponse.url()).pathname).toBe(
                `${threadPath(f1Agent, thread.uuid)}/generate-title`,
            );
            const title = await expectTitle(
                db,
                thread.uuid,
                await replyOfResponse(titleResponse),
            );
            await expect
                .poll(() => sidebarThreadTitles(page), {
                    message: 'sidebar thread titles',
                })
                .toContain(title);

            // Let the turn finish so no agent work outlives the test.
            await (await streamed).finished();
            return thread.uuid;
        });

    // Not in the plan: both plan steps title a thread whose history ends on
    // the user prompt. Only an answered thread ends on the assistant turn,
    // the case the migration's message order exists for.
    await test.step('API: re-title the answered thread, history ending on the assistant', async () => {
        await expectTitle(
            db,
            answeredThreadUuid,
            await api.send(
                'POST',
                `${threadPath(f1Agent, answeredThreadUuid)}/generate-title`,
                {},
            ),
        );
    });

    await test.step('API: the endpoint titles an API-created thread', async () => {
        const thread = await createThread(
            api,
            f1Agent,
            WITNESS_PROMPTS.totalOrders,
        );
        await expectTitle(
            db,
            thread.uuid,
            await api.send(
                'POST',
                `${threadPath(f1Agent, thread.uuid)}/generate-title`,
                {},
            ),
        );
    });
});
