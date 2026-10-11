import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    type AiAccessRefusal,
} from '@lightdash/common';
import type { Block, KnownBlock } from '@slack/bolt';
import type { ModelMessage } from 'ai';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import type { SlackClient } from '../../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { getAiAccessRefusalBlocks } from '../ai/utils/getSlackBlocks';
import { getSlackArtifactCardBlockId } from '../ai/utils/slackArtifactImages';
import { AiAgentService } from './AiAgentService';

const siteUrl = 'https://lightdash.example.com';
const signIn = new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN, {
    connectUrl: `${siteUrl}/connect?entryPoint=slack_link&token=a%2Fb`,
}).refusal;
const askAdmin = new AiAccessRefusedError(
    AiAccessRefusalReason.PRINCIPAL_FAILED,
    {
        settingsUrl: '/generalSettings/agentIdentity',
    },
).refusal;
const expectedGroup = getAiAccessRefusalBlocks(signIn, siteUrl);

describe.each([false, true])(
    'Slack replies (agent identity: %s)',
    (agentIdentityEnabled) => {
        const setup = ({
            card,
            refusals,
            response = 'Answer',
            error = null,
        }: {
            card: boolean;
            refusals: AiAccessRefusal[];
            response?: string;
            error?: Error | null;
        }) => {
            const slackPrompt = {
                promptUuid: 'prompt-1',
                threadUuid: 'thread-1',
                projectUuid: 'project-1',
                prompt: 'Run the query',
                createdByUserUuid: 'user-1',
                organizationUuid: 'org-1',
                slackChannelId: 'channel-1',
                slackUserId: 'slack-user-1',
                promptSlackTs: 'prompt-ts',
                slackThreadTs: 'thread-ts',
            };
            const postMessage = vi
                .fn<SlackClient['postMessage']>()
                .mockResolvedValue({ ok: true, ts: 'reply-ts' });
            const stopAgentStream = vi
                .fn<SlackClient['stopAgentStream']>()
                .mockResolvedValue({ ok: true });
            const appendAgentStream = vi
                .fn<SlackClient['appendAgentStream']>()
                .mockResolvedValue({ ok: true });
            const updateSlackResponseTs = vi.fn().mockResolvedValue(undefined);
            const postDeliveryStore = vi.fn().mockResolvedValue(undefined);
            const getPendingSqlApprovalForPrompt = vi
                .fn()
                .mockResolvedValue(null);
            const findSessionUserAndOrgByUuid = vi.fn().mockResolvedValue({
                ...defaultSessionUser,
                userUuid: 'user-1',
                organizationUuid: 'org-1',
            });
            const flagGet = vi
                .fn()
                .mockResolvedValue({ enabled: agentIdentityEnabled });
            const loadRequest = vi.fn().mockResolvedValue({});
            const assertOperationWithRequest = vi
                .fn()
                .mockResolvedValue(undefined);
            const slackAiArtifactImages = vi.fn().mockResolvedValue(undefined);
            const insertAgentAction = vi.fn().mockResolvedValue(undefined);
            const service = new AiAgentService({
                lightdashConfig: { ...lightdashConfigMock, siteUrl },
                featureFlagService: {
                    get: flagGet,
                },
                slackClient: {
                    postMessage,
                    stopAgentStream,
                    setAssistantStatus: vi.fn().mockResolvedValue(undefined),
                    startAgentStream: vi
                        .fn()
                        .mockResolvedValue({ ts: 'card-ts' }),
                    appendAgentStream,
                },
                userModel: {
                    findSessionUserAndOrgByUuid,
                    findServiceAccountByUserUuid: vi
                        .fn()
                        .mockResolvedValue(undefined),
                },
                agentPermissionService: {
                    loadRequest,
                    assertOperationWithRequest,
                },
                agentActionLogModel: { insert: insertAgentAction },
                schedulerClient: { slackAiArtifactImages },
                aiAgentModel: {
                    findSlackPrompt: vi.fn().mockResolvedValue(slackPrompt),
                    getThreadMessages: vi.fn().mockResolvedValue([]),
                    findThread: vi.fn().mockResolvedValue({ agentUuid: null }),
                    getPendingSqlApprovalForPrompt,
                    findThreadReferencedArtifacts: vi
                        .fn()
                        .mockResolvedValue(new Map()),
                    findArtifactsByThreadUuid: vi.fn().mockResolvedValue([]),
                    findArtifactVersionsByPromptUuid: vi
                        .fn()
                        .mockResolvedValue([]),
                    getToolResultsForPrompt: vi.fn().mockResolvedValue([]),
                    getToolCallsForPrompt: vi.fn().mockResolvedValue([]),
                    updateSlackResponseTs,
                    updateModelResponse: postDeliveryStore,
                    slackArtifactDeliveries: {
                        get: vi.fn().mockResolvedValue(null),
                    },
                },
                slackAuthenticationModel: {
                    getInstallationFromOrganizationUuid: vi
                        .fn()
                        .mockResolvedValue(null),
                },
                orgAiCopilotConfigResolver: {
                    isOrgBedrockRouted: async () => false,
                },
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            vi.spyOn(
                service as unknown as {
                    createAuditedAbility: () => { can: () => boolean };
                },
                'createAuditedAbility',
            ).mockReturnValue({ can: () => true });
            vi.spyOn(
                service as unknown as {
                    getDecisionClient: () => Promise<undefined>;
                },
                'getDecisionClient',
            ).mockResolvedValue(undefined);
            const getChatHistory = vi
                .spyOn(
                    service as unknown as {
                        getChatHistoryFromThreadMessages: () => Promise<
                            ModelMessage[]
                        >;
                    },
                    'getChatHistoryFromThreadMessages',
                )
                .mockResolvedValue([]);
            const getPromptErrorMessage = vi
                .spyOn(
                    service as unknown as {
                        getPromptErrorMessage: () => Promise<string>;
                    },
                    'getPromptErrorMessage',
                )
                .mockResolvedValue('Generation failed');
            const generate = vi
                .spyOn(service, 'generateOrStreamAgentResponse')
                .mockImplementation(async (_user, _conversation, options) => {
                    if (card)
                        await options.onSlackStepProgress?.(
                            'Running query',
                            'runQuery',
                            'call-1',
                            'in_progress',
                        );
                    refusals.forEach((refusal) =>
                        options.onSlackAccessRefusal?.(refusal),
                    );
                    if (error !== null) throw error;
                    return response;
                });
            const getDeliveredBlocks = (): (Block | KnownBlock)[] => [
                ...stopAgentStream.mock.calls.flatMap(
                    ([payload]) =>
                        payload.chunks?.flatMap((chunk) =>
                            chunk.type === 'blocks' ? chunk.blocks : [],
                        ) ?? [],
                ),
                ...postMessage.mock.calls.flatMap(
                    ([payload]) => payload.blocks ?? [],
                ),
            ];
            return {
                service,
                insertAgentAction,
                assertOperationWithRequest,
                slackAiArtifactImages,
                findSessionUserAndOrgByUuid,
                flagGet,
                loadRequest,
                postMessage,
                stopAgentStream,
                updateSlackResponseTs,
                postDeliveryStore,
                generate,
                getChatHistory,
                getPromptErrorMessage,
                getDeliveredBlocks,
                getPendingSqlApprovalForPrompt,
                appendAgentStream,
                finalBlocks: vi.spyOn(
                    service as unknown as {
                        getSlackAgentFinalBlocks: (
                            ...args: unknown[]
                        ) => Promise<unknown[]>;
                    },
                    'getSlackAgentFinalBlocks',
                ),
            };
        };

        const refusal = () =>
            new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            );
        const expectRefusalOnce = (
            h: ReturnType<typeof setup>,
            error: AiAccessRefusedError,
        ) => {
            const posts = h.postMessage.mock.calls.filter(([payload]) =>
                JSON.stringify(payload.blocks).includes('ai_access_'),
            );
            expect(posts).toHaveLength(1);
            expect(posts[0][0].blocks).toEqual([
                {
                    type: 'header',
                    text: { type: 'plain_text', text: 'Needs an admin' },
                },
                ...getAiAccessRefusalBlocks(error.refusal, siteUrl),
            ]);
        };

        it('fails closed on a queued check error, closes the stream and uses the generic error path', async () => {
            if (!agentIdentityEnabled) return;
            vi.useFakeTimers();
            const unhandled = vi.fn();
            process.on('unhandledRejection', unhandled);
            try {
                const h = setup({ card: true, refusals: [] });
                const error = new Error('Policy database unavailable');
                let appendCount = 0;
                h.generate.mockImplementation(
                    async (_user, _conversation, options) => {
                        void options.onSlackStepProgress?.(
                            'First',
                            'runQuery',
                            'first',
                            'in_progress',
                        );
                        await vi.advanceTimersByTimeAsync(0);
                        expect(
                            h.service['slackClient'].startAgentStream,
                        ).toHaveBeenCalledTimes(1);
                        expect(h.appendAgentStream).toHaveBeenCalled();
                        appendCount = h.appendAgentStream.mock.calls.length;
                        await vi.advanceTimersByTimeAsync(30_000);
                        h.loadRequest.mockRejectedValue(error);
                        void options.onSlackStepProgress?.(
                            'Denied',
                            'runQuery',
                            'second',
                            'in_progress',
                        );
                        await vi.advanceTimersByTimeAsync(0);
                        void options.onSlackStepProgress?.(
                            'Later',
                            'runQuery',
                            'third',
                            'complete',
                        );
                        await vi.advanceTimersByTimeAsync(0);
                        return 'Answer';
                    },
                );
                await expect(
                    h.service.replyToSlackPrompt('prompt-1'),
                ).rejects.toThrow('Failed to generate response');
                expect(h.appendAgentStream).toHaveBeenCalledTimes(appendCount);
                expect(h.stopAgentStream).toHaveBeenCalledExactlyOnceWith({
                    organizationUuid: 'org-1',
                    channelId: 'channel-1',
                    threadTs: 'thread-ts',
                    messageTs: 'card-ts',
                    chunks: [],
                });
                expect(h.postMessage).toHaveBeenCalledTimes(1);
                expect(h.getDeliveredBlocks()).toEqual([
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: '🔴 Generation failed' },
                    },
                    {
                        type: 'context',
                        elements: [
                            { type: 'plain_text', text: 'Reference: prompt-1' },
                        ],
                    },
                ]);
                expect(h.getPromptErrorMessage).toHaveBeenCalledWith(
                    expect.anything(),
                    error,
                    expect.anything(),
                    null,
                );
                expect(h.postDeliveryStore).not.toHaveBeenCalled();
                expect(unhandled).not.toHaveBeenCalled();
            } finally {
                process.off('unhandledRejection', unhandled);
                vi.useRealTimers();
            }
        });

        it.each(['refusal', 'error'] as const)(
            'fails closed at stream start on a guard %s',
            async (kind) => {
                if (!agentIdentityEnabled) return;
                vi.useFakeTimers();
                try {
                    const h = setup({ card: true, refusals: [] });
                    const error =
                        kind === 'refusal'
                            ? refusal()
                            : new Error('Check unavailable');
                    h.generate.mockImplementation(
                        async (_user, _conversation, options) => {
                            vi.setSystemTime(Date.now() + 30_000);
                            h.loadRequest.mockRejectedValue(error);
                            void options.onSlackStepProgress?.(
                                'First',
                                'runQuery',
                                'first',
                                'in_progress',
                            );
                            return 'Answer';
                        },
                    );
                    if (kind === 'refusal') {
                        await h.service.replyToSlackPrompt('prompt-1');
                        expectRefusalOnce(h, error as AiAccessRefusedError);
                    } else {
                        await expect(
                            h.service.replyToSlackPrompt('prompt-1'),
                        ).rejects.toThrow('Failed to generate response');
                        expect(h.postMessage).toHaveBeenCalledExactlyOnceWith(
                            expect.objectContaining({
                                text: '🔴 Generation failed',
                            }),
                        );
                    }
                    expect(
                        h.service['slackClient'].startAgentStream,
                    ).not.toHaveBeenCalled();
                    expect(h.appendAgentStream).not.toHaveBeenCalled();
                    expect(h.stopAgentStream).not.toHaveBeenCalled();
                    expect(h.postDeliveryStore).not.toHaveBeenCalled();
                } finally {
                    vi.useRealTimers();
                }
            },
        );

        it('refuses the second answer chunk after posting the first chunk', async () => {
            if (!agentIdentityEnabled) return;
            const h = setup({
                card: false,
                refusals: [],
                response: 'Answer paragraph.\n\n'.repeat(4000),
            });
            const error = refusal();
            h.postMessage.mockImplementationOnce(async () => {
                h.loadRequest.mockRejectedValue(error);
                return { ok: true, ts: 'first-ts' };
            });
            await h.service.replyToSlackPrompt('prompt-1');
            expect(h.postMessage).toHaveBeenCalledTimes(2);
            expect(JSON.stringify(h.postMessage.mock.calls[0])).toContain(
                'Answer paragraph.',
            );
            expectRefusalOnce(h, error);
            expect(h.postDeliveryStore).not.toHaveBeenCalled();
        });

        it('refuses the SQL approval card before posting it', async () => {
            if (!agentIdentityEnabled) return;
            const h = setup({ card: false, refusals: [] });
            const error = refusal();
            h.getPendingSqlApprovalForPrompt.mockImplementation(async () => {
                h.loadRequest.mockRejectedValue(error);
                return {
                    toolCallId: 'sql-call',
                    toolName: 'runSql',
                    sql: 'select 1',
                };
            });
            await h.service.replyToSlackPrompt('prompt-1');
            expect(h.postMessage).toHaveBeenCalledTimes(1);
            expectRefusalOnce(h, error);
            expect(JSON.stringify(h.postMessage.mock.calls)).not.toContain(
                'select 1',
            );
        });

        it('skips the Slack post-delivery store when its stale check refuses', async () => {
            if (!agentIdentityEnabled) return;
            vi.useFakeTimers();
            try {
                const h = setup({ card: false, refusals: [] });
                const error = refusal();
                h.postMessage.mockImplementationOnce(async () => {
                    vi.setSystemTime(Date.now() + 30_001);
                    h.loadRequest.mockRejectedValue(error);
                    return { ok: true, ts: 'answer-ts' };
                });
                await h.service.replyToSlackPrompt('prompt-1');
                expect(h.loadRequest).toHaveBeenCalledTimes(2);
                expect(h.postMessage).toHaveBeenCalledTimes(2);
                expect(h.postMessage.mock.calls[0][0].blocks).toEqual([
                    { type: 'markdown', text: 'Answer' },
                ]);
                expectRefusalOnce(h, error);
                expect(h.postDeliveryStore).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });

        it.each([
            ['refusal', 'passes'],
            ['refusal', 'fails'],
            ['error', 'passes'],
            ['error', 'fails'],
        ] as const)(
            'keeps the first %s when an overlapping slow check %s',
            async (kind, outcome) => {
                if (!agentIdentityEnabled) return;
                const h = setup({ card: false, refusals: [] });
                const first =
                    kind === 'refusal'
                        ? refusal()
                        : new Error('First check failure');
                const later =
                    kind === 'refusal'
                        ? new Error('Later check failure')
                        : refusal();
                const slowCheck = Promise.withResolvers<object>();
                const started = Promise.withResolvers<void>();
                const observed: unknown[] = [];
                let postsBeforeRethrow = -1;
                const deliver = h.service['deliverSlackAnswerMessages'].bind(
                    h.service,
                );
                vi.spyOn(
                    h.service as unknown as {
                        deliverSlackAnswerMessages: typeof deliver;
                    },
                    'deliverSlackAnswerMessages',
                ).mockImplementation(async (input) => {
                    h.loadRequest
                        .mockImplementationOnce(() => {
                            started.resolve();
                            return slowCheck.promise;
                        })
                        .mockRejectedValueOnce(first);
                    const slowDelivery = deliver(input);
                    const settled = slowDelivery.then(
                        () => null,
                        (error: unknown) => error,
                    );
                    await started.promise;
                    observed.push(
                        await input.deliveryGuard.assert().then(
                            () => null,
                            (error: unknown) => error,
                        ),
                    );
                    if (outcome === 'passes') slowCheck.resolve({});
                    else slowCheck.reject(later);
                    observed.push(await settled);
                    postsBeforeRethrow = h.postMessage.mock.calls.length;
                    observed.push(
                        await input.deliveryGuard.assert().then(
                            () => null,
                            (error: unknown) => error,
                        ),
                    );
                    throw first;
                });
                if (kind === 'refusal') {
                    await h.service.replyToSlackPrompt('prompt-1');
                    expectRefusalOnce(h, first as AiAccessRefusedError);
                } else {
                    await expect(
                        h.service.replyToSlackPrompt('prompt-1'),
                    ).rejects.toThrow('Failed to generate response');
                    expect(h.getPromptErrorMessage).toHaveBeenCalledWith(
                        expect.anything(),
                        first,
                        expect.anything(),
                        null,
                    );
                }
                expect(observed).toEqual([first, first, first]);
                expect(observed.every((error) => error === first)).toBe(true);
                expect(postsBeforeRethrow).toBe(0);
                expect(h.postMessage).toHaveBeenCalledTimes(1);
                expect(h.postDeliveryStore).not.toHaveBeenCalled();
            },
        );

        it.each([false, true])(
            'uses the generic error path when the final delivery check fails (card: %s)',
            async (card) => {
                if (!agentIdentityEnabled) return;
                const h = setup({ card, refusals: [] });
                const error = new Error('Final check unavailable');
                h.finalBlocks.mockImplementation(async () => {
                    if (card)
                        await vi.waitFor(() =>
                            expect(
                                h.service['slackClient'].startAgentStream,
                            ).toHaveBeenCalledTimes(1),
                        );
                    h.loadRequest.mockRejectedValue(error);
                    return [];
                });
                await expect(
                    h.service.replyToSlackPrompt('prompt-1'),
                ).rejects.toThrow('Failed to generate response');
                expect(h.postMessage).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({ text: '🔴 Generation failed' }),
                );
                expect(h.getPromptErrorMessage).toHaveBeenCalledWith(
                    expect.anything(),
                    error,
                    expect.anything(),
                    null,
                );
                expect(h.postDeliveryStore).not.toHaveBeenCalled();
                expect(
                    h.stopAgentStream.mock.calls.map(
                        ([payload]) => payload.chunks,
                    ),
                ).toEqual(card ? [[]] : []);
            },
        );

        it.each(['start', 'append'] as const)(
            'preserves main handling for a Slack %s failure with the flag off',
            async (stage) => {
                if (agentIdentityEnabled) return;
                const h = setup({ card: true, refusals: [] });
                const error = new Error('Slack unavailable');
                if (stage === 'start')
                    vi.mocked(
                        h.service['slackClient'].startAgentStream,
                    ).mockRejectedValue(error);
                else h.appendAgentStream.mockRejectedValue(error);
                await expect(
                    h.service.replyToSlackPrompt('prompt-1'),
                ).resolves.toBeUndefined();
                expect(h.getDeliveredBlocks()).toEqual([
                    { type: 'markdown', text: 'Answer' },
                ]);
                expect(h.postDeliveryStore).toHaveBeenCalledExactlyOnceWith({
                    promptUuid: 'prompt-1',
                    response: 'Answer',
                });
                expect(h.loadRequest).not.toHaveBeenCalled();
                expect(h.getPromptErrorMessage).not.toHaveBeenCalled();
                expect(h.postMessage).toHaveBeenCalledTimes(
                    stage === 'start' ? 1 : 0,
                );
                expect(h.stopAgentStream).toHaveBeenCalledTimes(
                    stage === 'start' ? 0 : 1,
                );
            },
        );

        it('preserves main query counts when identity enforcement is off', async () => {
            if (agentIdentityEnabled) return;
            const h = setup({ card: false, refusals: [] });
            await h.service.replyToSlackPrompt('prompt-1');
            expect(h.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(1);
            expect(h.loadRequest).toHaveBeenCalledTimes(0);
            expect(h.flagGet).toHaveBeenCalledTimes(1);
            expect(h.postMessage).toHaveBeenCalledTimes(1);
            expect(h.postDeliveryStore).toHaveBeenCalledTimes(1);
        });

        it('refuses an inactive prompt author only with enforcement on', async () => {
            const h = setup({ card: false, refusals: [] });
            h.findSessionUserAndOrgByUuid.mockResolvedValue({
                ...defaultSessionUser,
                userUuid: 'user-1',
                organizationUuid: 'org-1',
                isActive: false,
            });
            await h.service.replyToSlackPrompt('prompt-1');
            expect(h.generate).toHaveBeenCalledTimes(
                agentIdentityEnabled ? 0 : 1,
            );
            expect(h.postDeliveryStore).toHaveBeenCalledTimes(
                agentIdentityEnabled ? 0 : 1,
            );
            expect(h.postMessage).toHaveBeenCalledTimes(1);
            if (agentIdentityEnabled)
                expect(JSON.stringify(h.getDeliveredBlocks())).not.toContain(
                    'Answer',
                );
            expect(h.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(1);
            expect(h.insertAgentAction).toHaveBeenCalledTimes(
                agentIdentityEnabled ? 1 : 0,
            );
        });

        it.each(['inactive', 'policy'] as const)(
            'refuses %s before the final answer and closes the stream',
            async (reason) => {
                if (!agentIdentityEnabled) return;
                const h = setup({ card: true, refusals: [] });
                h.finalBlocks.mockImplementation(async () => {
                    await vi.waitFor(() =>
                        expect(
                            h.service['slackClient'].startAgentStream,
                        ).toHaveBeenCalledTimes(1),
                    );
                    if (reason === 'inactive')
                        h.findSessionUserAndOrgByUuid.mockResolvedValue({
                            ...defaultSessionUser,
                            userUuid: 'user-1',
                            organizationUuid: 'org-1',
                            isActive: false,
                        });
                    else
                        h.assertOperationWithRequest.mockRejectedValue(
                            new AiAccessRefusedError(
                                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                            ),
                        );
                    return [];
                });
                await h.service.replyToSlackPrompt('prompt-1');
                expect(h.generate).toHaveBeenCalledTimes(1);
                expect(h.postDeliveryStore).not.toHaveBeenCalled();
                expect(h.stopAgentStream).toHaveBeenCalledWith(
                    expect.objectContaining({ chunks: [] }),
                );
                expect(h.postMessage).toHaveBeenCalledTimes(1);
                expect(JSON.stringify(h.getDeliveredBlocks())).not.toContain(
                    'Answer',
                );
            },
        );

        it('rechecks a long stream after thirty seconds and stops further appends', async () => {
            if (!agentIdentityEnabled) return;
            vi.useFakeTimers();
            try {
                const h = setup({ card: true, refusals: [] });
                const reads: number[] = [];
                const appends: number[] = [];
                h.generate.mockImplementation(
                    async (_user, _conversation, options) => {
                        void options.onSlackStepProgress?.(
                            'First',
                            'runQuery',
                            'first',
                            'in_progress',
                        );
                        await vi.advanceTimersByTimeAsync(0);
                        reads.push(h.loadRequest.mock.calls.length);
                        await vi.advanceTimersByTimeAsync(29_999);
                        void options.onSlackStepProgress?.(
                            'Second',
                            'runQuery',
                            'second',
                            'in_progress',
                        );
                        await vi.advanceTimersByTimeAsync(0);
                        reads.push(h.loadRequest.mock.calls.length);
                        h.assertOperationWithRequest.mockRejectedValue(
                            new AiAccessRefusedError(
                                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                            ),
                        );
                        await vi.advanceTimersByTimeAsync(1);
                        appends.push(h.appendAgentStream.mock.calls.length);
                        void options.onSlackStepProgress?.(
                            'Denied',
                            'runQuery',
                            'third',
                            'in_progress',
                        );
                        await vi.advanceTimersByTimeAsync(0);
                        void options.onSlackStepProgress?.(
                            'Later',
                            'runQuery',
                            'fourth',
                            'complete',
                        );
                        await vi.advanceTimersByTimeAsync(0);
                        reads.push(h.loadRequest.mock.calls.length);
                        appends.push(h.appendAgentStream.mock.calls.length);
                        return 'Answer';
                    },
                );
                await h.service.replyToSlackPrompt('prompt-1');
                expect(reads).toEqual([1, 1, 2]);
                expect(appends[1]).toBe(appends[0]);
                expect(h.postDeliveryStore).not.toHaveBeenCalled();
                expect(h.postMessage).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });

        it('posts the answer, runs the Slack post-delivery store, and propagates the image marker only when enabled', async () => {
            const h = setup({ card: false, refusals: [] });
            h.finalBlocks.mockResolvedValue([
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId('version'),
                },
            ]);
            vi.mocked(
                h.service['aiAgentModel'].slackArtifactDeliveries.get,
            ).mockResolvedValue({
                finished_at: null,
                render_inputs: { version: {} },
            } as never);
            await h.service.replyToSlackPrompt('prompt-1');
            expect(h.postMessage).toHaveBeenCalledTimes(1);
            expect(h.postDeliveryStore).toHaveBeenCalledTimes(1);
            expect(h.slackAiArtifactImages).toHaveBeenCalledExactlyOnceWith({
                slackPromptUuid: 'prompt-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
                ...(agentIdentityEnabled
                    ? {
                          agentWork: {
                              userUuid: 'user-1',
                              organizationUuid: 'org-1',
                              projectUuid: 'project-1',
                          },
                      }
                    : {}),
            });
        });

        const expectOneGroup = (
            blocks: (Block | KnownBlock)[],
            group = expectedGroup,
        ) => {
            expect(
                blocks.filter((block) =>
                    JSON.stringify(block).includes('ai_access_'),
                ),
            ).toEqual([group[1]]);
            const index = blocks.findIndex(
                (block) => JSON.stringify(block) === JSON.stringify(group[0]),
            );
            expect(index).toBeGreaterThanOrEqual(0);
            expect(blocks.slice(index, index + 2)).toEqual(group);
        };

        describe.each([false, true])(
            'Slack access refusal delivery (card: %s)',
            (card) => {
                it.each([
                    [signIn],
                    [askAdmin, signIn],
                    [signIn, askAdmin],
                    [signIn, signIn],
                ])(
                    'delivers exactly one group for refusals %j',
                    async (...refusals) => {
                        const harness = setup({ card, refusals });
                        await harness.service.replyToSlackPrompt('prompt-1');
                        expect(harness.getDeliveredBlocks()).toEqual(
                            expectedGroup,
                        );
                        expect(harness.finalBlocks).not.toHaveBeenCalled();
                        expect(harness.generate).toHaveBeenCalledOnce();
                    },
                );

                it.each([
                    AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
                    AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                ])(
                    'delivers a thrown pre-stream refusal without failure copy: %s',
                    async (reason) => {
                        const error = new AiAccessRefusedError(reason, {
                            connectUrl:
                                reason ===
                                AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED
                                    ? `${siteUrl}/api/v1/auth/slack?team=team&channel=channel-1&message=prompt-ts&trigger=app_mention&thread_ts=thread-ts`
                                    : null,
                        });
                        const harness = setup({ card, refusals: [], error });
                        await expect(
                            harness.service.replyToSlackPrompt('prompt-1'),
                        ).resolves.toBeUndefined();
                        const title =
                            reason ===
                            AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED
                                ? 'Needs your sign-in'
                                : 'Needs an admin';
                        expect(harness.getDeliveredBlocks()).toEqual([
                            ...(card
                                ? []
                                : [
                                      {
                                          type: 'header',
                                          text: {
                                              type: 'plain_text',
                                              text: title,
                                          },
                                      },
                                  ]),
                            ...getAiAccessRefusalBlocks(error.refusal, siteUrl),
                        ]);
                        const calls = JSON.stringify([
                            harness.postMessage.mock.calls,
                            harness.stopAgentStream.mock.calls,
                        ]);
                        expect(calls).not.toMatch(
                            /🔴|Generation failed|Reference:|Please try again/,
                        );
                        expect(
                            harness.postMessage.mock.calls.length +
                                harness.stopAgentStream.mock.calls.length,
                        ).toBe(1);
                        if (card)
                            expect(
                                harness.appendAgentStream,
                            ).toHaveBeenCalledWith(
                                expect.objectContaining({
                                    chunks: [{ type: 'plan_update', title }],
                                }),
                            );
                        else
                            expect(harness.postMessage).toHaveBeenCalledWith(
                                expect.objectContaining({
                                    text: expect.stringContaining(title),
                                }),
                            );
                    },
                );

                it('delivers the ask-admin settings group', async () => {
                    const harness = setup({ card, refusals: [askAdmin] });
                    await harness.service.replyToSlackPrompt('prompt-1');
                    expectOneGroup(
                        harness.getDeliveredBlocks(),
                        getAiAccessRefusalBlocks(askAdmin, siteUrl),
                    );
                });

                it('posts only the refusal for an empty response', async () => {
                    const harness = setup({
                        card,
                        refusals: [signIn],
                        response: '',
                    });
                    await harness.service.replyToSlackPrompt('prompt-1');
                    expect(harness.getDeliveredBlocks()).toEqual([
                        ...expectedGroup,
                    ]);
                });

                it('appends the group after the error and before any reference', async () => {
                    const harness = setup({
                        card,
                        refusals: [askAdmin, signIn],
                        error: new Error('Generation failed'),
                    });
                    if (card)
                        await harness.service.replyToSlackPrompt('prompt-1');
                    else
                        await expect(
                            harness.service.replyToSlackPrompt('prompt-1'),
                        ).rejects.toThrow('Failed to generate response');
                    expect(harness.getDeliveredBlocks()).toEqual([
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: card
                                    ? ':warning: Generation failed'
                                    : '🔴 Generation failed',
                            },
                        },
                        ...expectedGroup,
                        ...(card
                            ? []
                            : [
                                  {
                                      type: 'context',
                                      elements: [
                                          {
                                              type: 'plain_text',
                                              text: 'Reference: prompt-1',
                                          },
                                      ],
                                  },
                              ]),
                    ]);
                });

                it('preserves the exact answer payload without a refusal', async () => {
                    const harness = setup({ card, refusals: [] });
                    await harness.service.replyToSlackPrompt('prompt-1');
                    if (card) {
                        expect(harness.appendAgentStream).toHaveBeenCalledWith(
                            expect.objectContaining({
                                chunks: [
                                    { type: 'plan_update', title: 'Answered' },
                                ],
                            }),
                        );
                        expect(
                            harness.stopAgentStream,
                        ).toHaveBeenCalledExactlyOnceWith({
                            organizationUuid: 'org-1',
                            channelId: 'channel-1',
                            threadTs: 'thread-ts',
                            messageTs: 'card-ts',
                            chunks: [
                                {
                                    type: 'blocks',
                                    blocks: [
                                        { type: 'markdown', text: 'Answer' },
                                    ],
                                },
                            ],
                        });
                        expect(harness.postMessage).not.toHaveBeenCalled();
                    } else {
                        expect(
                            harness.postMessage,
                        ).toHaveBeenCalledExactlyOnceWith({
                            organizationUuid: 'org-1',
                            channel: 'channel-1',
                            thread_ts: 'thread-ts',
                            text: 'Answer\n',
                            blocks: [{ type: 'markdown', text: 'Answer' }],
                            unfurl_links: false,
                        });
                        expect(harness.stopAgentStream).not.toHaveBeenCalled();
                    }
                });

                it('ignores ineligible refusals', async () => {
                    const harness = setup({
                        card,
                        refusals: [{ ...signIn, connectUrl: null }],
                    });
                    await harness.service.replyToSlackPrompt('prompt-1');
                    expect(harness.getDeliveredBlocks()).toEqual([
                        { type: 'markdown', text: 'Answer' },
                    ]);
                });

                it.each([signIn, askAdmin])(
                    'posts only the refusal instead of a long answer, with the right title: %j',
                    async (selected) => {
                        const harness = setup({
                            card,
                            refusals: [selected],
                            response:
                                'Model answer <slack-chart versionUuid="chart-1" /> '.repeat(
                                    3000,
                                ),
                        });
                        await harness.service.replyToSlackPrompt('prompt-1');
                        expect(harness.getDeliveredBlocks()).toEqual(
                            getAiAccessRefusalBlocks(selected, siteUrl),
                        );
                        expect(
                            harness.postMessage.mock.calls.length +
                                harness.stopAgentStream.mock.calls.length,
                        ).toBe(1);
                        expect(harness.finalBlocks).not.toHaveBeenCalled();
                        expect(
                            harness.postDeliveryStore,
                        ).not.toHaveBeenCalled();
                        expect(
                            JSON.stringify(harness.postMessage.mock.calls),
                        ).not.toContain('Model answer');
                        expect(
                            JSON.stringify(harness.stopAgentStream.mock.calls),
                        ).not.toContain('Model answer');
                        if (card)
                            expect(
                                harness.appendAgentStream,
                            ).toHaveBeenCalledWith(
                                expect.objectContaining({
                                    chunks: [
                                        {
                                            type: 'plan_update',
                                            title:
                                                selected === signIn
                                                    ? 'Needs your sign-in'
                                                    : 'Needs an admin',
                                        },
                                    ],
                                }),
                            );
                    },
                );

                it('keeps the group when Slack rejects an oversized answer', async () => {
                    const harness = setup({ card, refusals: [signIn] });
                    const delivery = card
                        ? harness.stopAgentStream
                        : harness.postMessage;
                    delivery.mockRejectedValueOnce({
                        data: { error: 'msg_too_long' },
                    });
                    await harness.service.replyToSlackPrompt('prompt-1');
                    expect(delivery).toHaveBeenCalledTimes(2);
                    const payload = card
                        ? harness.stopAgentStream.mock.calls[1][0].chunks?.flatMap(
                              (chunk) =>
                                  chunk.type === 'blocks' ? chunk.blocks : [],
                          )
                        : harness.postMessage.mock.calls[1][0].blocks;
                    expectOneGroup(payload ?? []);
                });

                it('does not send the group again after Slack response timestamp persistence fails', async () => {
                    const harness = setup({ card, refusals: [signIn] });
                    harness.updateSlackResponseTs.mockRejectedValueOnce(
                        new Error('Persistence failed'),
                    );
                    if (card)
                        await harness.service.replyToSlackPrompt('prompt-1');
                    else
                        await expect(
                            harness.service.replyToSlackPrompt('prompt-1'),
                        ).rejects.toThrow('Failed to generate response');
                    expectOneGroup(harness.getDeliveredBlocks());
                });

                it('retains the refusal when the answer was not accepted by Slack', async () => {
                    const harness = setup({ card, refusals: [signIn] });
                    const delivery = card
                        ? harness.stopAgentStream
                        : harness.postMessage;
                    delivery.mockRejectedValueOnce(
                        new Error('Slack unavailable'),
                    );
                    if (card)
                        await harness.service.replyToSlackPrompt('prompt-1');
                    else
                        await expect(
                            harness.service.replyToSlackPrompt('prompt-1'),
                        ).rejects.toThrow('Failed to generate response');
                    const payload = card
                        ? harness.stopAgentStream.mock.calls[1][0].chunks?.flatMap(
                              (chunk) =>
                                  chunk.type === 'blocks' ? chunk.blocks : [],
                          )
                        : harness.postMessage.mock.calls[1][0].blocks;
                    expectOneGroup(payload ?? []);
                });

                it('leaves SQL approval pending replies unchanged', async () => {
                    const harness = setup({ card, refusals: [signIn] });
                    harness.getPendingSqlApprovalForPrompt.mockResolvedValue({
                        toolCallId: 'call-1',
                        sql: 'SELECT 1',
                    });
                    const postApproval = vi
                        .spyOn(
                            harness.service as unknown as {
                                postSqlApprovalCard: () => Promise<void>;
                            },
                            'postSqlApprovalCard',
                        )
                        .mockResolvedValue(undefined);
                    await harness.service.replyToSlackPrompt('prompt-1');
                    expect(postApproval).toHaveBeenCalledOnce();
                    expect(harness.getDeliveredBlocks()).toEqual([]);
                });
            },
        );

        it('delivers an admission refusal before response generation starts', async () => {
            const error = new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            );
            const h = setup({ card: false, refusals: [] });
            h.getChatHistory.mockRejectedValue(error);
            await expect(
                h.service.replyToSlackPrompt('prompt-1'),
            ).resolves.toBeUndefined();
            expect(h.generate).not.toHaveBeenCalled();
            expect(h.postMessage).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    text: expect.stringContaining('Needs an admin'),
                    blocks: [
                        {
                            type: 'header',
                            text: {
                                type: 'plain_text',
                                text: 'Needs an admin',
                            },
                        },
                        ...getAiAccessRefusalBlocks(error.refusal, siteUrl),
                    ],
                }),
            );
        });

        describe('Slack task-card size fallback', () => {
            it.each([signIn, askAdmin])(
                'keeps the refusal title and blocks in the task-card size fallback: %j',
                async (selected) => {
                    const harness = setup({
                        card: true,
                        refusals: [selected],
                        error: Object.assign(new Error('too long'), {
                            data: { error: 'msg_too_long' },
                        }),
                    });
                    await harness.service.replyToSlackPrompt('prompt-1');
                    expect(harness.getDeliveredBlocks()).toEqual(
                        getAiAccessRefusalBlocks(selected, siteUrl),
                    );
                    expect(harness.appendAgentStream).toHaveBeenCalledWith(
                        expect.objectContaining({
                            chunks: [
                                {
                                    type: 'plan_update',
                                    title:
                                        selected === signIn
                                            ? 'Needs your sign-in'
                                            : 'Needs an admin',
                                },
                            ],
                        }),
                    );
                },
            );
        });
    },
);
