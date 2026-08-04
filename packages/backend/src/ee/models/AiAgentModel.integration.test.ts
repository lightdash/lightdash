import { SEED_ORG_1, SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import { AiPromptTableName, AiThreadTableName } from '../database/entities/ai';
import { AiAgentModel } from './AiAgentModel';

describe('AiAgentModel prompt activity', () => {
    let database: Knex;
    let model: AiAgentModel;
    const threadUuids = new Set<string>();

    beforeAll(() => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;
    });

    afterEach(async () => {
        if (threadUuids.size === 0) return;
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', [...threadUuids])
            .delete();
        threadUuids.clear();
    });

    const createWebAppThread = async (): Promise<string> => {
        const threadUuid = await model.createWebAppThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            createdFrom: 'web_app',
            agentUuid: null,
        });
        threadUuids.add(threadUuid);
        return threadUuid;
    };

    const getThreadUpdatedAt = async (
        threadUuid: string,
    ): Promise<Date | null> => {
        const row = await database(AiThreadTableName)
            .select('updated_at')
            .where('ai_thread_uuid', threadUuid)
            .first();
        return row?.updated_at ?? null;
    };

    it('sets thread updated_at to the inserted web prompt created_at', async () => {
        const threadUuid = await createWebAppThread();
        expect(await getThreadUpdatedAt(threadUuid)).toBeNull();

        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Track this prompt activity',
        });
        const prompt = await database(AiPromptTableName)
            .select('created_at')
            .where('ai_prompt_uuid', promptUuid)
            .first();

        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            prompt?.created_at,
        );
    });

    it('fails only prompts that are still pending during shutdown', async () => {
        const threadUuid = await createWebAppThread();
        const [pendingPromptUuid, completedPromptUuid, failedPromptUuid] =
            await Promise.all(
                ['pending', 'completed', 'failed'].map((state) =>
                    model.createWebAppPrompt({
                        threadUuid,
                        createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                        prompt: `${state} prompt`,
                    }),
                ),
            );

        await Promise.all([
            model.updateModelResponse({
                promptUuid: completedPromptUuid,
                response: 'Completed response',
            }),
            model.updateModelResponse({
                promptUuid: failedPromptUuid,
                errorMessage: 'Existing failure',
            }),
        ]);

        const promptStates = (await database(AiPromptTableName)
            .select(['ai_prompt_uuid', 'response', 'error_message'])
            .select(database.raw('responded_at::text as responded_at'))
            .whereIn('ai_prompt_uuid', [
                pendingPromptUuid,
                completedPromptUuid,
                failedPromptUuid,
            ])) as unknown as Array<{
            ai_prompt_uuid: string;
            responded_at: string | null;
            response: string | null;
            error_message: string | null;
        }>;
        const initialStatesByUuid = new Map(
            promptStates.map((prompt) => [prompt.ai_prompt_uuid, prompt]),
        );
        const pendingState = initialStatesByUuid.get(pendingPromptUuid)!;
        const failedState = initialStatesByUuid.get(failedPromptUuid)!;

        const updatedPromptUuids = await model.failPendingPrompts(
            [pendingPromptUuid, completedPromptUuid, failedPromptUuid],
            'Server restarted',
        );
        const prompts = await database(AiPromptTableName)
            .select([
                'ai_prompt_uuid',
                'response',
                'responded_at',
                'error_message',
            ])
            .whereIn('ai_prompt_uuid', [
                pendingPromptUuid,
                completedPromptUuid,
                failedPromptUuid,
            ]);
        const promptsByUuid = new Map(
            prompts.map((prompt) => [prompt.ai_prompt_uuid, prompt]),
        );

        expect(updatedPromptUuids).toEqual([pendingPromptUuid]);
        expect(promptsByUuid.get(pendingPromptUuid)).toMatchObject({
            response: null,
            error_message: 'Server restarted',
        });
        expect(
            promptsByUuid.get(pendingPromptUuid)?.responded_at,
        ).not.toBeNull();

        await model.updateModelResponse(
            {
                promptUuid: pendingPromptUuid,
                response: 'Late response',
            },
            {
                onlyIfPending: true,
            },
        );
        const shutdownFailedPrompt = await database(AiPromptTableName)
            .select(['response', 'error_message'])
            .where('ai_prompt_uuid', pendingPromptUuid)
            .first();

        expect(shutdownFailedPrompt).toMatchObject({
            response: null,
            error_message: 'Server restarted',
        });
        expect(promptsByUuid.get(completedPromptUuid)).toMatchObject({
            response: 'Completed response',
            error_message: null,
        });
        expect(promptsByUuid.get(failedPromptUuid)).toMatchObject({
            response: null,
            error_message: 'Existing failure',
        });

        const retryStarted = await model.resetPromptResponseForRetry(
            failedPromptUuid,
            {
                respondedAt: failedState.responded_at,
                response: failedState.response,
                errorMessage: failedState.error_message,
            },
        );
        expect(retryStarted).toBe(true);

        const retriedPromptUuids = await model.failPendingPrompts(
            [failedPromptUuid],
            'Server restarted during retry',
        );
        expect(retriedPromptUuids).toEqual([failedPromptUuid]);

        await model.updateModelResponse(
            {
                promptUuid: failedPromptUuid,
                response: 'Late retry response',
            },
            {
                onlyIfPending: true,
            },
        );
        const shutdownFailedRetry = await database(AiPromptTableName)
            .select(['response', 'error_message'])
            .where('ai_prompt_uuid', failedPromptUuid)
            .first();
        expect(shutdownFailedRetry).toMatchObject({
            response: null,
            error_message: 'Server restarted during retry',
        });
    });

    it('keeps reused tool call ids scoped to their prompts', async () => {
        const threadUuid = await createWebAppThread();
        const expectedResults = ['first prompt result', 'second prompt result'];
        const promptUuids = await Promise.all(
            expectedResults.map((result) =>
                model.createWebAppPrompt({
                    threadUuid,
                    createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    prompt: `Prompt for ${result}`,
                }),
            ),
        );
        const toolCallId = 'reused-tool-call-id';

        await Promise.all(
            promptUuids.map((promptUuid) =>
                model.createToolCall({
                    promptUuid,
                    toolCallId,
                    toolName: 'findExplores',
                    toolArgs: {},
                    parentToolCallId: null,
                }),
            ),
        );
        await model.createToolResults(
            promptUuids.map((promptUuid, index) => ({
                promptUuid,
                toolCallId,
                toolName: 'findExplores',
                result: expectedResults[index],
            })),
        );

        const histories = await Promise.all(
            promptUuids.map((promptUuid) =>
                model.getToolCallsAndResultsForPrompt(promptUuid),
            ),
        );

        expect(
            histories.map((history) =>
                history.map(({ toolResult }) => toolResult?.result),
            ),
        ).toEqual(expectedResults.map((result) => [result]));
    });

    it('keeps Slack prompt activity monotonic', async () => {
        const suffix = crypto.randomUUID();
        const threadUuid = await model.createSlackThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            createdFrom: 'slack',
            slackUserId: 'U123',
            slackChannelId: `C-${suffix}`,
            slackThreadTs: `thread-${suffix}`,
            agentUuid: null,
        });
        threadUuids.add(threadUuid);
        const historicalCreatedAt = new Date('2026-01-01T00:00:00.123Z');

        await model.bulkCreateSlackPrompts(threadUuid, [
            {
                createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'Historical context',
                slackUserId: 'U123',
                slackChannelId: `C-${suffix}`,
                promptSlackTs: `historical-${suffix}`,
                createdAt: historicalCreatedAt,
            },
        ]);
        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            historicalCreatedAt,
        );

        const promptUuid = await model.createSlackPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Current Slack prompt',
            slackUserId: 'U123',
            slackChannelId: `C-${suffix}`,
            promptSlackTs: `current-${suffix}`,
        });
        const prompt = await database(AiPromptTableName)
            .select('created_at')
            .where('ai_prompt_uuid', promptUuid)
            .first();
        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            prompt?.created_at,
        );

        await model.bulkCreateSlackPrompts(threadUuid, [
            {
                createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'Older historical context',
                slackUserId: 'U123',
                slackChannelId: `C-${suffix}`,
                promptSlackTs: `older-${suffix}`,
                createdAt: new Date('2025-01-01T00:00:00.123Z'),
            },
        ]);
        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            prompt?.created_at,
        );
    });

    it('sets a clone updated_at to its last prompt final created_at', async () => {
        const sourceThreadUuid = await createWebAppThread();
        const sourcePromptUuid = await model.createWebAppPrompt({
            threadUuid: sourceThreadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Clone this prompt',
        });
        const historicalCreatedAt = new Date('2026-01-02T00:00:00.456Z');
        await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
            AiPromptTableName,
            'created_at',
            historicalCreatedAt,
            'ai_prompt_uuid',
            sourcePromptUuid,
        ]);

        const cloneThreadUuid = await model.cloneThread({
            sourceThreadUuid,
            sourcePromptUuid,
            targetUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            includeSelectedPromptResponse: true,
        });
        threadUuids.add(cloneThreadUuid);
        const clonedPrompt = await database(AiPromptTableName)
            .select('created_at')
            .where('ai_thread_uuid', cloneThreadUuid)
            .orderBy('created_at', 'desc')
            .first();

        expect(clonedPrompt?.created_at).toEqual(historicalCreatedAt);
        expect(await getThreadUpdatedAt(cloneThreadUuid)).toEqual(
            clonedPrompt?.created_at,
        );
    });
});
