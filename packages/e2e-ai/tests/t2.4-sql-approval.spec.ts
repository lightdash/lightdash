import { SEED_ORG_1_ADMIN } from '@lightdash/common';
import type { Pool } from 'pg';
import { z } from 'zod';
import { checkAnsweredTurn } from '../lib/agentTurn';
import {
    composer,
    isThreadPost,
    openNewThreadPage,
    workingIndicator,
} from '../lib/agentUi';
import { replyOfResponse, resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { queryRows } from '../lib/db';
import { WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { isFeatureFlagEnabled } from '../lib/flags';
import { reportObservation } from '../lib/report';
import { STREAM_KINDS, uiStreamPartTypes } from '../lib/stream';
import { createThread, threadPath, threadSummarySchema } from '../lib/threads';
import { retryOnceOnVariance, type AttemptResult } from '../lib/variance';

// Plan T2.4. V on the model choosing runSql despite F2's instruction.
// Preconditions: F2; the admin user may use the SQL runner (seeded);
// multi-source-query and compose-sql-runner not both on, because the composer
// then replaces runSql (agentV2.ts).

/**
 * The SQL turn's ledger on top of the T2.1 outcome checks: runSql was called,
 * every call was approved by the user, and one succeeded against a ready
 * query (joined through its SQL, since runSql records no queryUuid).
 */
const checkSqlTurn = async (
    db: Pool,
    promptUuid: string,
): Promise<AttemptResult> => {
    const { ledger, successes } = await checkAnsweredTurn(db, promptUuid);
    const runSqlCalls = ledger.toolCalls.filter(
        (call) => call.tool_name === 'runSql',
    );
    if (runSqlCalls.length === 0) {
        return {
            kind: 'variance',
            assertion: 'the model did not call runSql',
            ledger,
        };
    }
    for (const call of runSqlCalls) {
        const approval = single(
            await queryRows(
                db,
                'SELECT decision, decided_by_user_uuid FROM ai_sql_approval WHERE tool_call_id = $1',
                [call.tool_call_id],
                z.object({
                    decision: z.string(),
                    decided_by_user_uuid: z.string().nullable(),
                }),
            ),
            `ai_sql_approval for ${call.tool_call_id}`,
        );
        expect(approval, 'SQL approval').toEqual({
            decision: 'approved',
            decided_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
    }
    expect(
        successes.filter((result) => result.tool_name === 'runSql').length,
        'successful runSql results',
    ).toBeGreaterThan(0);
    return { kind: 'pass' };
};

test('T2.4 Raw SQL with the approval card, and auto-approve', async ({
    page,
    api,
    db,
    f2Agent,
}) => {
    const composerReplacesRunSql =
        (await isFeatureFlagEnabled(api, 'multi-source-query')) &&
        (await isFeatureFlagEnabled(api, 'compose-sql-runner'));
    test.skip(
        composerReplacesRunSql,
        'multi-source-query and compose-sql-runner are both on, so runComposerQueries replaces runSql',
    );
    expect(f2Agent.enableSqlMode, 'F2 has SQL mode on').toBe(true);

    await test.step('browser: approval card, Approve, the SQL runs', async () => {
        await retryOnceOnVariance(async () => {
            const threadCreated = page.waitForResponse(
                isThreadPost(f2Agent, ''),
            );
            const streamFinished: Promise<'done'> = page
                .waitForResponse(isThreadPost(f2Agent, '/stream'))
                .then(async (response): Promise<'done'> => {
                    await response.finished();
                    return 'done';
                });
            await openNewThreadPage(page, f2Agent);
            await composer(page).fill(WITNESS_PROMPTS.sqlRowCount);
            await page.getByRole('button', { name: 'Send message' }).click();
            await expect(workingIndicator(page).first()).toBeVisible();
            const thread = resultsOf(
                await replyOfResponse(await threadCreated),
                threadSummarySchema,
            );

            // Every runSql call waits for its own card, so approve each one
            // until the stream ends.
            const approve = page
                .getByRole('button', { name: 'Approve', exact: true })
                .first();
            let approvals = 0;
            for (;;) {
                const next: 'card' | 'done' = await Promise.race([
                    approve
                        .waitFor({ state: 'visible', timeout: 0 })
                        .then((): 'card' => 'card'),
                    streamFinished,
                ]);
                if (next === 'done') break;
                const decided = page.waitForResponse(
                    (response) =>
                        response.request().method() === 'POST' &&
                        new URL(response.url()).pathname.endsWith(
                            '/sql-approval',
                        ),
                );
                await approve.click();
                expect((await decided).status(), 'sql-approval status').toBe(
                    200,
                );
                await expect(approve).toBeHidden();
                approvals += 1;
            }
            reportObservation(`${approvals} approval card(s) approved`);
            await expect(workingIndicator(page)).toHaveCount(0);
            return checkSqlTurn(db, thread.firstMessage.uuid);
        });
    });

    await test.step('API: autoApproveSql runs runSql with no card', async () => {
        await retryOnceOnVariance(async () => {
            const thread = await createThread(
                api,
                f2Agent,
                WITNESS_PROMPTS.sqlRowCount,
            );
            const reply = await api.send(
                'POST',
                `${threadPath(f2Agent, thread.uuid)}/stream`,
                { enableSqlMode: true, autoApproveSql: true },
            );
            expect(reply.status, 'stream status').toBe(200);
            expect(
                uiStreamPartTypes(reply.text),
                'stream error parts',
            ).not.toContain(STREAM_KINDS.error);
            return checkSqlTurn(db, thread.firstMessage.uuid);
        });
    });
});
