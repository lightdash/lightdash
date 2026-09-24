import { z } from 'zod';
import { projectUuid, withAgentPreference } from '../lib/agents';
import { composer, isThreadPost, workingIndicator } from '../lib/agentUi';
import { replyOfResponse, resultsOf } from '../lib/api';
import { seededChart } from '../lib/charts';
import { queryRows } from '../lib/db';
import { expect, test } from '../lib/fixtures';
import { readPromptLedger } from '../lib/ledger';
import { reportObservation } from '../lib/report';
import { threadSummarySchema } from '../lib/threads';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T2.7. V on which read tool, or on answering from the pinned context
// alone; a missing context row is real. Preconditions: F1 (made the user's
// default agent for the test, then restored), a seeded saved chart.

const CHART_NAME = 'How many orders we have over time ?';
const PROMPT = 'Describe what this chart shows';

// With content tools off (F1) only runSavedChart is registered of these.
const CHART_READ_TOOLS = ['readContent', 'runSavedChart', 'runContentQuery'];

test('T2.7 Ask AI from a saved chart with pinned context', async ({
    page,
    api,
    db,
    f1Agent,
}) => {
    const chart = await seededChart(api, CHART_NAME);

    await withAgentPreference(api, f1Agent, () =>
        retryOnceOnVariance(async () => {
            await page.goto(`/projects/${projectUuid}/saved/${chart.uuid}`);
            await page.getByRole('button', { name: 'Chart actions' }).click();
            await page.getByRole('menuitem', { name: 'Ask AI Agent' }).click();

            // The Launcher panel opens with the chart pinned.
            await expect(
                page.getByRole('button', { name: 'Close panel' }),
            ).toBeVisible();
            await expect(
                page.getByRole('button', { name: 'Ask AI Agent' }),
            ).toBeVisible();
            const pinned = page
                .getByText('Pinned context', { exact: true })
                .locator('..');
            await expect(pinned).toContainText(CHART_NAME);

            const threadCreated = page.waitForResponse(
                isThreadPost(f1Agent, ''),
            );
            const streamed = page.waitForResponse(
                isThreadPost(f1Agent, '/stream'),
            );
            await composer(page).fill(PROMPT);
            await page.getByRole('button', { name: 'Send message' }).click();
            await expect(workingIndicator(page).first()).toBeVisible();
            const thread = resultsOf(
                await replyOfResponse(await threadCreated),
                threadSummarySchema,
            );
            await (await streamed).finished();
            await expect(workingIndicator(page)).toHaveCount(0);
            const promptUuid = thread.firstMessage.uuid;

            const contexts = await queryRows(
                db,
                'SELECT entity_type, entity_uuid FROM ai_prompt_context WHERE ai_prompt_uuid = $1',
                [promptUuid],
                z.object({
                    entity_type: z.string(),
                    entity_uuid: z.string().nullable(),
                }),
            );
            expect(contexts, 'ai_prompt_context rows').toContainEqual({
                entity_type: 'chart',
                entity_uuid: chart.uuid,
            });

            const ledger = await readPromptLedger(db, promptUuid);
            expect(ledger.prompt.response, 'ai_prompt.response').toBeTruthy();
            expect(
                ledger.prompt.error_message,
                'ai_prompt.error_message',
            ).toBeNull();
            // Schema rejections are real on the first attempt (plan §5).
            expect(
                ledger.toolCallErrors,
                'ai_agent_tool_call_error rows',
            ).toEqual([]);
            const reads = ledger.toolResults.filter(
                (row) =>
                    CHART_READ_TOOLS.includes(row.tool_name) &&
                    row.metadata?.status === 'success',
            );
            if (reads.length === 0) {
                return {
                    kind: 'variance',
                    assertion: 'no successful chart read tool call',
                    ledger,
                };
            }
            reportObservation(
                `chart read by ${reads.map((row) => row.tool_name).join(', ')}`,
            );
            return { kind: 'pass' };
        }),
    );
});
