import {
    AI_DATA_APP_BUILD_PENDING_GRACE_MS,
    AiDuplicateSlackPromptError,
    APP_VERSION_CANCELLED_BY_USER,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
    type AppVersionStatus,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfig } from '../../config/lightdashConfig';
import { AppsTableName } from '../../database/entities/apps';
import { type AppModel } from '../../models/AppModel';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import {
    AiAgentToolResultTableName,
    AiPromptTableName,
    AiThreadTableName,
    AiWritebackRunTableName,
    type AiPromptNeedsUserInputMetadata,
} from '../database/entities/ai';
import { AiAgentModel } from './AiAgentModel';
import { AiWritebackRunModel } from './AiWritebackRunModel';

describe('AiAgentModel prompt activity', () => {
    let database: Knex;
    let model: AiAgentModel;
    let writebackRunModel: AiWritebackRunModel;
    const threadUuids = new Set<string>();

    beforeAll(() => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;
        writebackRunModel = context.app
            .getModels()
            .getAiWritebackRunModel<AiWritebackRunModel>();
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

    it('normalizes resolved expression args on every model read path', async () => {
        const resolvedArgs = {
            title: 'Orders by status',
            description: 'Completed orders',
            queryConfig: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_count'],
                sorts: [],
                limit: 500,
                customMetrics: null,
                tableCalculations: null,
                filters: {
                    dimensions: {
                        connector: 'and',
                        rules: [
                            {
                                fieldId: 'orders_status',
                                fieldType: 'string',
                                fieldFilterType: 'string',
                                operator: 'equals',
                                values: ['complete'],
                            },
                        ],
                    },
                    metrics: {
                        connector: 'or',
                        rules: [
                            {
                                fieldId: 'orders_count',
                                fieldType: 'count',
                                fieldFilterType: 'number',
                                operator: 'greaterThan',
                                values: [10],
                            },
                        ],
                    },
                    tableCalculations: null,
                },
            },
            chartConfig: null,
            mergeConfig: null,
        };
        const persistedConfig = {
            source: 'semantic',
            config: resolvedArgs,
        };
        const threadUuid = await createWebAppThread();
        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Persist a filter expression',
        });
        const created = await model.createArtifact({
            threadUuid,
            promptUuid,
            artifactType: 'chart',
            title: 'Orders by status',
            description: 'Completed orders',
            vizConfig: persistedConfig,
        });
        const version = await model.createArtifactVersion({
            artifactUuid: created.artifactUuid,
            promptUuid,
            title: 'Orders by status',
            description: 'Completed orders',
            vizConfig: persistedConfig,
        });
        const fetched = await model.getArtifact(created.artifactUuid);
        const byThread = await model.findArtifactsByThreadUuid(
            threadUuid,
            'chart',
        );
        const byPrompt =
            await model.findArtifactVersionsByPromptUuid(promptUuid);

        for (const artifact of [
            created,
            version,
            fetched,
            ...byThread,
            ...byPrompt,
        ]) {
            expect(artifact.chartConfig).toMatchObject({
                source: 'semantic',
                config: {
                    queryConfig: {
                        filters: {
                            dimensions: {
                                connector: 'and',
                                rules: [
                                    {
                                        fieldId: 'orders_status',
                                        values: ['complete'],
                                    },
                                ],
                            },
                            metrics: {
                                connector: 'or',
                                rules: [
                                    {
                                        fieldId: 'orders_count',
                                        values: [10],
                                    },
                                ],
                            },
                        },
                    },
                    mergeConfig: null,
                },
            });
        }
    });

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

    it('atomically assigns one execution mode to a prompt', async () => {
        const threadUuid = await createWebAppThread();
        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Choose one execution mode',
        });

        const [standardClaimed, researchClaimed] = await Promise.all([
            model.claimPromptExecutionMode(promptUuid, 'standard'),
            model.claimPromptExecutionMode(promptUuid, 'deep_research'),
        ]);

        expect([standardClaimed, researchClaimed].filter(Boolean)).toHaveLength(
            1,
        );
        expect(
            await model.claimPromptExecutionMode(
                promptUuid,
                standardClaimed ? 'standard' : 'deep_research',
            ),
        ).toBe(true);
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

    it('persists a successful terminal response after retrying a failed prompt with token usage', async () => {
        const threadUuid = await createWebAppThread();
        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Retry a failed response with recorded token usage',
        });
        const failedAttemptTokenUsage = {
            totalTokens: 41,
            finalStepTotalTokens: 17,
        };
        const retriedAttemptTokenUsage = {
            totalTokens: 23,
            finalStepTotalTokens: 23,
        };
        const classificationMetadata = {
            gate: 'match',
            model: 'claude-haiku-4-5',
            durationMs: 125,
            confidence: 0.9,
        } as const;
        const readPromptState = async () =>
            database(AiPromptTableName)
                .select([
                    'response',
                    'error_message',
                    'token_usage',
                    'needs_user_input',
                    'needs_user_input_metadata',
                ])
                .select(
                    database.raw('responded_at::text as responded_at'),
                    database.raw('retried_at::text as retried_at'),
                )
                .where('ai_prompt_uuid', promptUuid)
                .first<{
                    response: string | null;
                    error_message: string | null;
                    token_usage: typeof failedAttemptTokenUsage | null;
                    needs_user_input: boolean | null;
                    needs_user_input_metadata: AiPromptNeedsUserInputMetadata | null;
                    responded_at: string | null;
                    retried_at: string | null;
                }>();

        const failedAttemptPersisted = await model.updateModelResponse({
            promptUuid,
            errorMessage: 'The agent finished without writing a response.',
            tokenUsage: failedAttemptTokenUsage,
        });
        const classificationPersisted = await model.updatePromptNeedsUserInput({
            promptUuid,
            needsUserInput: true,
            metadata: classificationMetadata,
        });
        const failedState = await readPromptState();

        expect({ failedAttemptPersisted, classificationPersisted }).toEqual({
            failedAttemptPersisted: true,
            classificationPersisted: true,
        });
        expect(failedState).toMatchObject({
            response: null,
            error_message: 'The agent finished without writing a response.',
            token_usage: failedAttemptTokenUsage,
            needs_user_input: true,
            needs_user_input_metadata: classificationMetadata,
            retried_at: null,
        });
        expect(failedState?.responded_at).not.toBeNull();

        const retryStarted = await model.resetPromptResponseForRetry(
            promptUuid,
            {
                respondedAt: failedState!.responded_at,
                response: failedState!.response,
                errorMessage: failedState!.error_message,
            },
        );
        const resetState = await readPromptState();

        expect(retryStarted).toBe(true);
        expect(resetState).toMatchObject({
            response: null,
            error_message: null,
            responded_at: null,
            needs_user_input: null,
            needs_user_input_metadata: null,
        });
        expect(resetState?.retried_at).not.toBeNull();

        const terminalResponsePersisted = await model.updateModelResponse(
            {
                promptUuid,
                response: 'The retried response completed successfully.',
                tokenUsage: retriedAttemptTokenUsage,
            },
            { onlyIfUnfinalized: true },
        );
        const terminalState = await readPromptState();

        expect({ terminalResponsePersisted, ...terminalState }).toEqual({
            terminalResponsePersisted: true,
            response: 'The retried response completed successfully.',
            error_message: null,
            token_usage: retriedAttemptTokenUsage,
            needs_user_input: null,
            needs_user_input_metadata: null,
            responded_at: expect.any(String),
            retried_at: resetState?.retried_at,
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

    it('resolves a cloned pending writeback from its source run', async () => {
        const sourceThreadUuid = await createWebAppThread();
        const sourcePromptUuid = await model.createWebAppPrompt({
            threadUuid: sourceThreadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Add a revenue metric',
        });
        await model.updateModelResponse({
            promptUuid: sourcePromptUuid,
            response: 'I started the change.',
        });

        const toolCallId = 'writeback-call';
        await model.createToolCall({
            promptUuid: sourcePromptUuid,
            toolCallId,
            toolName: 'editDbtProject',
            toolArgs: {
                prompt: 'Add a revenue metric',
                prUrl: null,
                startNewPullRequest: null,
            },
            parentToolCallId: null,
        });
        const run = await writebackRunModel.create({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            aiThreadUuid: sourceThreadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            source: 'web',
            promptUuid: sourcePromptUuid,
            toolCallId,
        });
        await model.createToolResults([
            {
                promptUuid: sourcePromptUuid,
                toolCallId,
                toolName: 'editDbtProject',
                result: 'The writeback is running.',
                metadata: {
                    status: 'pending',
                    aiWritebackRunUuid: run.ai_writeback_run_uuid,
                },
            },
        ]);
        const pendingStartedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
        await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
            AiAgentToolResultTableName,
            'created_at',
            pendingStartedAt,
            'ai_prompt_uuid',
            sourcePromptUuid,
        ]);
        const historicalNonWritebackCreatedAt = new Date(
            '2025-01-01T00:00:00.000Z',
        );
        await database(AiAgentToolResultTableName).insert({
            ai_prompt_uuid: sourcePromptUuid,
            tool_call_id: 'unrelated-tool-call',
            tool_name: 'unrelatedTool',
            result: 'Unrelated result',
            created_at: historicalNonWritebackCreatedAt,
        });

        const cloneThreadUuid = await model.cloneThread({
            sourceThreadUuid,
            sourcePromptUuid,
            targetUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            includeSelectedPromptResponse: true,
        });
        threadUuids.add(cloneThreadUuid);
        const clonePrompt = await database(AiPromptTableName)
            .select('ai_prompt_uuid')
            .where('ai_thread_uuid', cloneThreadUuid)
            .first();
        if (!clonePrompt) {
            throw new Error('Expected the cloned prompt to exist');
        }
        const clonePromptUuid = clonePrompt.ai_prompt_uuid;
        const clonedNonWritebackResult = await database(
            AiAgentToolResultTableName,
        )
            .select('created_at')
            .where('ai_prompt_uuid', clonePromptUuid)
            .where('tool_call_id', 'unrelated-tool-call')
            .first();
        if (!clonedNonWritebackResult) {
            throw new Error('Expected the unrelated tool result to be cloned');
        }
        expect(clonedNonWritebackResult.created_at).not.toEqual(
            historicalNonWritebackCreatedAt,
        );
        const [clonedPendingResult] =
            await model.getToolResultsForPrompt(clonePromptUuid);
        expect(clonedPendingResult).toMatchObject({
            promptUuid: clonePromptUuid,
            metadata: { status: 'pending' },
            createdAt: pendingStartedAt,
        });

        await writebackRunModel.markReady(run.ai_writeback_run_uuid, {
            branchName: 'lightdash/add-revenue',
            prUrl: 'https://github.com/lightdash/example/pull/1',
        });

        const [resultDuringCanonicalSync] =
            await model.getToolResultsForPrompt(clonePromptUuid);
        expect(resultDuringCanonicalSync.metadata).toMatchObject({
            status: 'pending',
        });

        await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
            AiAgentToolResultTableName,
            'created_at',
            new Date(Date.now() - 5 * 60 * 1000 - 1),
            'ai_prompt_uuid',
            clonePromptUuid,
        ]);

        const [fallbackResult] =
            await model.getToolResultsForPrompt(clonePromptUuid);
        expect(fallbackResult).toMatchObject({
            promptUuid: clonePromptUuid,
            result: 'The writeback finished and opened a pull request.',
            metadata: {
                status: 'success',
                prUrl: 'https://github.com/lightdash/example/pull/1',
            },
        });

        await model.updateToolResult(sourcePromptUuid, toolCallId, {
            result: 'Opened the revenue metric pull request.',
            metadata: {
                status: 'success',
                prUrl: 'https://github.com/lightdash/example/pull/1',
            },
        });

        const [clonedResult] =
            await model.getToolResultsForPrompt(clonePromptUuid);

        expect(clonedResult).toMatchObject({
            promptUuid: clonePromptUuid,
            result: 'Opened the revenue metric pull request.',
            metadata: {
                status: 'success',
                prUrl: 'https://github.com/lightdash/example/pull/1',
            },
        });

        const [{ toolResult: clonedHistoryResult }] =
            await model.getToolCallsAndResultsForPrompt(clonePromptUuid);
        expect(clonedHistoryResult).toMatchObject({
            promptUuid: clonePromptUuid,
            result: 'Opened the revenue metric pull request.',
            metadata: {
                status: 'success',
                prUrl: 'https://github.com/lightdash/example/pull/1',
            },
        });
    });

    it.each([
        {
            caseName: 'ready without a pull request',
            status: 'ready',
            prUrl: null,
            errorMessage: null,
            expectedResult:
                'The writeback finished without opening a pull request.',
            expectedMetadata: { status: 'success', prUrl: null },
        },
        {
            caseName: 'cancelled',
            status: 'cancelled',
            prUrl: null,
            errorMessage: null,
            expectedResult: 'The writeback was cancelled.',
            expectedMetadata: { status: 'error', errorCode: 'unknown' },
        },
        {
            caseName: 'errored with a message',
            status: 'error',
            prUrl: null,
            errorMessage: 'The coding agent stopped.',
            expectedResult: 'The coding agent stopped.',
            expectedMetadata: { status: 'error', errorCode: 'unknown' },
        },
        {
            caseName: 'errored without a message',
            status: 'error',
            prUrl: null,
            errorMessage: null,
            expectedResult:
                'The writeback stopped unexpectedly before it finished.',
            expectedMetadata: { status: 'error', errorCode: 'unknown' },
        },
    ] as const)(
        'returns a bounded fallback when a run is $caseName',
        async ({
            status,
            prUrl,
            errorMessage,
            expectedResult,
            expectedMetadata,
        }) => {
            const threadUuid = await createWebAppThread();
            const promptUuid = await model.createWebAppPrompt({
                threadUuid,
                createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'Add a revenue metric',
            });
            const toolCallId = 'writeback-call';
            const run = await writebackRunModel.create({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                aiThreadUuid: threadUuid,
                createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                source: 'web',
                promptUuid,
                toolCallId,
            });
            await database(AiWritebackRunTableName)
                .where('ai_writeback_run_uuid', run.ai_writeback_run_uuid)
                .update({
                    status,
                    pr_url: prUrl,
                    error_message: errorMessage,
                });
            await model.createToolResults([
                {
                    promptUuid,
                    toolCallId,
                    toolName: 'editDbtProject',
                    result: 'The writeback is running.',
                    metadata: {
                        status: 'pending',
                        aiWritebackRunUuid: run.ai_writeback_run_uuid,
                    },
                },
            ]);
            await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
                AiAgentToolResultTableName,
                'created_at',
                new Date(Date.now() - 5 * 60 * 1000 - 1),
                'ai_prompt_uuid',
                promptUuid,
            ]);

            const [result] = await model.getToolResultsForPrompt(promptUuid);

            expect(result).toMatchObject({
                result: expectedResult,
                metadata: expectedMetadata,
            });
        },
    );

    it('does not resolve a pending writeback from untrusted run links', async () => {
        const threadUuid = await createWebAppThread();
        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Add a revenue metric',
        });
        const toolCallId = 'writeback-call';
        await model.createToolCall({
            promptUuid,
            toolCallId,
            toolName: 'editDbtProject',
            toolArgs: {
                prompt: 'Add a revenue metric',
                prUrl: null,
                startNewPullRequest: null,
            },
            parentToolCallId: null,
        });
        const outOfScopeRun = await writebackRunModel.create({
            organizationUuid: SEED_ORG_2.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            aiThreadUuid: threadUuid,
            createdByUserUuid: SEED_ORG_2_ADMIN.user_uuid,
            source: 'web',
            promptUuid,
            toolCallId,
        });
        await writebackRunModel.markReady(outOfScopeRun.ai_writeback_run_uuid, {
            branchName: 'private-branch',
            prUrl: 'https://github.com/another-org/private/pull/1',
        });
        await model.createToolResults([
            {
                promptUuid,
                toolCallId,
                toolName: 'editDbtProject',
                result: 'The writeback is running.',
                metadata: {
                    status: 'pending',
                    aiWritebackRunUuid: outOfScopeRun.ai_writeback_run_uuid,
                },
            },
        ]);
        await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
            AiAgentToolResultTableName,
            'created_at',
            new Date(Date.now() - 5 * 60 * 1000 - 1),
            'ai_prompt_uuid',
            promptUuid,
        ]);

        const [result] = await model.getToolResultsForPrompt(promptUuid);

        expect(result).toMatchObject({
            result: 'The writeback is running.',
            metadata: {
                status: 'pending',
                aiWritebackRunUuid: outOfScopeRun.ai_writeback_run_uuid,
            },
        });

        const mismatchedRun = await writebackRunModel.create({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            aiThreadUuid: threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            source: 'web',
            promptUuid,
            toolCallId: 'another-writeback-call',
        });
        await writebackRunModel.markReady(mismatchedRun.ai_writeback_run_uuid, {
            branchName: 'unrelated-branch',
            prUrl: 'https://github.com/lightdash/example/pull/2',
        });
        await model.updateToolResult(promptUuid, toolCallId, {
            result: 'The writeback is running.',
            metadata: {
                status: 'pending',
                aiWritebackRunUuid: mismatchedRun.ai_writeback_run_uuid,
            },
        });
        await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
            AiAgentToolResultTableName,
            'created_at',
            new Date(Date.now() - 5 * 60 * 1000 - 1),
            'ai_prompt_uuid',
            promptUuid,
        ]);

        const [mismatchedResult] =
            await model.getToolResultsForPrompt(promptUuid);
        expect(mismatchedResult).toMatchObject({
            result: 'The writeback is running.',
            metadata: {
                status: 'pending',
                aiWritebackRunUuid: mismatchedRun.ai_writeback_run_uuid,
            },
        });
    });

    it('serializes duplicate v1 Slack prompt delivery', async () => {
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
        const prompt = {
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'same event',
            slackUserId: 'U123',
            slackChannelId: `C-${suffix}`,
            promptSlackTs: `prompt-${suffix}`,
        };

        const results = await Promise.allSettled([
            model.createSlackPrompt(prompt),
            model.createSlackPrompt(prompt),
        ]);

        expect(
            results.filter(({ status }) => status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            results.filter((result) => result.status === 'rejected')[0],
        ).toMatchObject({ reason: expect.any(AiDuplicateSlackPromptError) });
    });

    it('deletes a prompt interrupt so a retry starts clean', async () => {
        const threadUuid = await createWebAppThread();
        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Interrupt me',
        });

        // Deleting when no interrupt exists is a no-op (the common retry case)
        await model.deleteAiPromptInterrupt(promptUuid);
        expect(await model.hasAiPromptInterrupt(promptUuid)).toBe(false);

        await model.createAiPromptInterrupt({
            promptUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        expect(await model.hasAiPromptInterrupt(promptUuid)).toBe(true);

        await model.deleteAiPromptInterrupt(promptUuid);
        expect(await model.hasAiPromptInterrupt(promptUuid)).toBe(false);

        // A fresh interrupt after the delete still applies to the new run.
        await model.createAiPromptInterrupt({
            promptUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        expect(await model.hasAiPromptInterrupt(promptUuid)).toBe(true);
    });
});

describe('AiAgentModel pending data app builds', () => {
    let database: Knex;
    let model: AiAgentModel;
    let appModel: AppModel;
    const threadUuids = new Set<string>();
    const appUuids = new Set<string>();

    beforeAll(() => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;
        appModel = context.app.getModels().getAppModel();
    });

    afterEach(async () => {
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', [...threadUuids])
            .delete();
        threadUuids.clear();
        await database(AppsTableName)
            .whereIn('app_id', [...appUuids])
            .delete();
        appUuids.clear();
    });

    const toolCallId = 'generate-data-app-call';

    const createPendingBuild = async ({
        status,
        error = null,
        statusMessage = null,
        startedAgoMs = 0,
        toolName = 'generateDataApp',
    }: {
        status: AppVersionStatus;
        error?: string | null;
        statusMessage?: string | null;
        startedAgoMs?: number;
        toolName?: 'generateDataApp' | 'iterateDataApp';
    }) => {
        const { app } = await appModel.createWithVersion(
            {
                project_uuid: SEED_PROJECT.project_uuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                name: 'Revenue app',
            },
            { version: 1, prompt: 'Build a revenue app' },
            'pending',
        );
        appUuids.add(app.app_id);
        await appModel.updateVersionStatus(
            app.app_id,
            1,
            status,
            error,
            statusMessage,
        );

        const threadUuid = await model.createWebAppThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            createdFrom: 'web_app',
            agentUuid: null,
        });
        threadUuids.add(threadUuid);
        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Build me a revenue app',
        });
        await model.createToolCall({
            promptUuid,
            toolCallId,
            toolName,
            toolArgs: {
                prompt: 'Build a revenue app',
                template: null,
                dashboardSlug: null,
                chartSlugs: null,
            },
            parentToolCallId: null,
        });
        await model.createToolResults([
            {
                promptUuid,
                toolCallId,
                toolName,
                result: 'Started the data app build.',
                metadata: {
                    status: 'pending',
                    appUuid: app.app_id,
                    version: 1,
                },
            },
        ]);
        if (startedAgoMs > 0) {
            await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
                AiAgentToolResultTableName,
                'created_at',
                new Date(Date.now() - startedAgoMs),
                'ai_prompt_uuid',
                promptUuid,
            ]);
        }
        return { promptUuid, appUuid: app.app_id, appSlug: app.slug };
    };

    it('resolves a pending result to success once the version is ready', async () => {
        const { promptUuid, appUuid, appSlug } = await createPendingBuild({
            status: 'ready',
        });

        const [result] = await model.getToolResultsForPrompt(promptUuid);

        expect(result.metadata).toEqual({
            status: 'success',
            appUuid,
            version: 1,
            name: 'Revenue app',
            slug: appSlug,
            href: `${lightdashConfig.siteUrl}/projects/${SEED_PROJECT.project_uuid}/apps/${appUuid}`,
        });
    });

    it('resolves a pending iterateDataApp result the same way', async () => {
        const { promptUuid, appUuid, appSlug } = await createPendingBuild({
            status: 'ready',
            toolName: 'iterateDataApp',
        });

        const [result] = await model.getToolResultsForPrompt(promptUuid);

        expect(result.metadata).toEqual({
            status: 'success',
            appUuid,
            version: 1,
            name: 'Revenue app',
            slug: appSlug,
            href: `${lightdashConfig.siteUrl}/projects/${SEED_PROJECT.project_uuid}/apps/${appUuid}`,
        });
    });

    it('resolves a pending result to error once the version failed', async () => {
        const { promptUuid, appUuid } = await createPendingBuild({
            status: 'error',
            error: 'boom',
            statusMessage: 'Build timed out. Please try again.',
        });

        const [result] = await model.getToolResultsForPrompt(promptUuid);

        expect(result.metadata).toEqual({
            status: 'error',
            appUuid,
            reason: 'failed',
            message: 'Build timed out. Please try again.',
        });
    });

    it('resolves a pending result to error once the version was cancelled', async () => {
        const { promptUuid, appUuid } = await createPendingBuild({
            status: 'error',
            error: APP_VERSION_CANCELLED_BY_USER,
            statusMessage: APP_VERSION_CANCELLED_BY_USER,
        });

        const [result] = await model.getToolResultsForPrompt(promptUuid);

        expect(result.metadata).toEqual({
            status: 'error',
            appUuid,
            reason: 'cancelled',
            message: 'The build was cancelled.',
        });
    });

    it('keeps a fresh pending result while the version is still building', async () => {
        const { promptUuid, appUuid } = await createPendingBuild({
            status: 'generating',
        });

        const [result] = await model.getToolResultsForPrompt(promptUuid);

        expect(result.metadata).toEqual({
            status: 'pending',
            appUuid,
            version: 1,
        });
    });

    it('expires a pending result still building after the grace period', async () => {
        const { promptUuid, appUuid } = await createPendingBuild({
            status: 'generating',
            startedAgoMs: AI_DATA_APP_BUILD_PENDING_GRACE_MS + 1000,
        });

        const [result] = await model.getToolResultsForPrompt(promptUuid);

        expect(result.metadata).toMatchObject({
            status: 'error',
            appUuid,
            reason: 'failed',
        });
        expect(result.metadata).toHaveProperty(
            'message',
            expect.stringContaining('30 minutes'),
        );
    });
});
