import { SEED_ORG_1 } from '@lightdash/common';
import { projectUuid } from '../lib/agents';
import { checkAnsweredTurn } from '../lib/agentTurn';
import { WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { readPromptLedger } from '../lib/ledger';
import { attachJson } from '../lib/report';
import {
    createThread,
    generateAnswer,
    latestAssistantMessage,
} from '../lib/threads';
import {
    equals,
    expectUsageLine,
    markUsageLog,
    present,
    usageTokens,
    usageValue,
    witnessUsage,
} from '../lib/usageLog';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T2.1, the reference ledger the browser tests compare against. V: no
// query tool call once is variance (the model answered from metadata); twice
// is real. Judged on outcome: a recovered tool error is reported, not failed;
// an unrecovered one, a schema error row, null token_usage or missing
// attribution on a present line is real on the first attempt.
// Preconditions: F1. Attribution needs E2E_AI_BACKEND_LOG with the backend on
// LIGHTDASH_LOG_FORMAT=json; with the log path unset it is reported skipped.

test('T2.1 Non-streaming answer with a warehouse query (API)', async ({
    api,
    db,
    f1Agent,
}) => {
    await retryOnceOnVariance(async (attemptNumber) => {
        const mark = await markUsageLog();
        const thread = await createThread(
            api,
            f1Agent,
            WITNESS_PROMPTS.totalOrders,
        );
        const promptUuid = thread.firstMessage.uuid;
        try {
            await generateAnswer(api, f1Agent, thread.uuid);
        } finally {
            await attachJson(
                `attempt ${attemptNumber} ledger`,
                await readPromptLedger(db, promptUuid),
            );
        }

        const assistant = await latestAssistantMessage(
            api,
            f1Agent,
            thread.uuid,
        );
        expect(assistant, 'assistant message in GET thread').toMatchObject({
            status: 'idle',
            errorMessage: null,
        });

        const { verdict, tokenUsage, ledger } = await checkAnsweredTurn(
            db,
            promptUuid,
        );
        // The non-streaming path records no first chunk; T2.2 asserts the
        // streamed path does, so the pair pins the timing to streaming.
        expect(
            ledger.prompt.response_timing?.firstTokenAt,
            'response_timing.firstTokenAt on the non-streaming path',
        ).toBeNull();
        if (verdict.kind === 'variance') return verdict;

        await witnessUsage(
            mark,
            'agent attribution',
            (line) =>
                usageValue(line, 'feature') === 'agent' &&
                usageValue(line, 'threadId') === thread.uuid &&
                usageValue(line, 'promptId') === promptUuid,
            (lines) => {
                lines.forEach((line) =>
                    expectUsageLine(line, {
                        organizationId: equals(SEED_ORG_1.organization_uuid),
                        projectId: equals(projectUuid),
                        aiAgentId: equals(f1Agent.uuid),
                        provider: present,
                        model: present,
                        keyManagement: present,
                    }),
                );
                // One line per model step; together they are the turn's spend.
                const lineTotal = lines.reduce(
                    (sum, line) =>
                        sum + (usageTokens(line, 'totalTokens') ?? Number.NaN),
                    0,
                );
                expect(lineTotal, 'sum of AI usage totalTokens').toBe(
                    tokenUsage.totalTokens,
                );
            },
        );
        return verdict;
    });
});
