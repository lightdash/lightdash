import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    type AiAccessRefusal,
} from '@lightdash/common';
import type { Block, KnownBlock } from '@slack/bolt';
import type { ModelMessage } from 'ai';
import type { SlackClient } from '../../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { getAiAccessRefusalBlocks } from '../ai/utils/getSlackBlocks';
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
    const updateSlackResponseTs = vi.fn().mockResolvedValue(undefined);
    const updateModelResponse = vi.fn().mockResolvedValue(undefined);
    const getPendingSqlApprovalForPrompt = vi.fn().mockResolvedValue(null);
    const service = new AiAgentService({
        lightdashConfig: { ...lightdashConfigMock, siteUrl },
        slackClient: {
            postMessage,
            stopAgentStream,
            setAssistantStatus: vi.fn().mockResolvedValue(undefined),
            startAgentStream: vi.fn().mockResolvedValue({ ts: 'card-ts' }),
            appendAgentStream: vi.fn().mockResolvedValue({ ok: true }),
        },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
                userUuid: 'user-1',
                organizationUuid: 'org-1',
            }),
        },
        aiAgentModel: {
            findSlackPrompt: vi.fn().mockResolvedValue(slackPrompt),
            getThreadMessages: vi.fn().mockResolvedValue([]),
            findThread: vi.fn().mockResolvedValue({ agentUuid: null }),
            getPendingSqlApprovalForPrompt,
            findThreadReferencedArtifacts: vi.fn().mockResolvedValue(new Map()),
            findArtifactsByThreadUuid: vi.fn().mockResolvedValue([]),
            findArtifactVersionsByPromptUuid: vi.fn().mockResolvedValue([]),
            getToolResultsForPrompt: vi.fn().mockResolvedValue([]),
            getToolCallsForPrompt: vi.fn().mockResolvedValue([]),
            updateSlackResponseTs,
            updateModelResponse,
            slackArtifactDeliveries: { get: vi.fn().mockResolvedValue(null) },
        },
        slackAuthenticationModel: {
            getInstallationFromOrganizationUuid: vi
                .fn()
                .mockResolvedValue(null),
        },
        orgAiCopilotConfigResolver: { isOrgBedrockRouted: async () => false },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(
        service as unknown as {
            createAuditedAbility: () => { can: () => boolean };
        },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true });
    vi.spyOn(
        service as unknown as { getDecisionClient: () => Promise<undefined> },
        'getDecisionClient',
    ).mockResolvedValue(undefined);
    vi.spyOn(
        service as unknown as {
            getChatHistoryFromThreadMessages: () => Promise<ModelMessage[]>;
        },
        'getChatHistoryFromThreadMessages',
    ).mockResolvedValue([]);
    vi.spyOn(
        service as unknown as { getPromptErrorMessage: () => Promise<string> },
        'getPromptErrorMessage',
    ).mockResolvedValue('Generation failed');
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
        ...postMessage.mock.calls.flatMap(([payload]) => payload.blocks ?? []),
    ];
    return {
        service,
        postMessage,
        stopAgentStream,
        updateSlackResponseTs,
        updateModelResponse,
        generate,
        getDeliveredBlocks,
        getPendingSqlApprovalForPrompt,
    };
};

const expectOneGroup = (
    blocks: (Block | KnownBlock)[],
    group = expectedGroup,
) => {
    expect(
        blocks.filter((block) => JSON.stringify(block).includes('ai_access_')),
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
                expectOneGroup(harness.getDeliveredBlocks());
                expect(harness.generate).toHaveBeenCalledOnce();
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

        it('appends the group to an empty response', async () => {
            const harness = setup({ card, refusals: [signIn], response: '' });
            await harness.service.replyToSlackPrompt('prompt-1');
            expect(harness.getDeliveredBlocks()).toEqual([
                { type: 'markdown', text: 'No response generated.' },
                ...expectedGroup,
            ]);
        });

        it('appends the group after the error and before any reference', async () => {
            const harness = setup({
                card,
                refusals: [askAdmin, signIn],
                error: new Error('Generation failed'),
            });
            if (card) await harness.service.replyToSlackPrompt('prompt-1');
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
                expect(harness.stopAgentStream).toHaveBeenCalledExactlyOnceWith(
                    {
                        organizationUuid: 'org-1',
                        channelId: 'channel-1',
                        threadTs: 'thread-ts',
                        messageTs: 'card-ts',
                        chunks: [
                            {
                                type: 'blocks',
                                blocks: [{ type: 'markdown', text: 'Answer' }],
                            },
                        ],
                    },
                );
                expect(harness.postMessage).not.toHaveBeenCalled();
            } else {
                expect(harness.postMessage).toHaveBeenCalledExactlyOnceWith({
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

        it('puts one group on the last message of a split answer', async () => {
            const harness = setup({
                card,
                refusals: [signIn, signIn],
                response: 'Answer '.repeat(3000),
            });
            await harness.service.replyToSlackPrompt('prompt-1');
            expect(
                harness.postMessage.mock.calls.length +
                    harness.stopAgentStream.mock.calls.length,
            ).toBeGreaterThan(1);
            expectOneGroup(harness.getDeliveredBlocks());
            expect(
                harness.postMessage.mock.calls.at(-1)?.[0].blocks?.slice(-2),
            ).toEqual(expectedGroup);
        });

        it('keeps the group when Slack rejects an oversized answer', async () => {
            const harness = setup({ card, refusals: [signIn] });
            const delivery = card
                ? harness.stopAgentStream
                : harness.postMessage;
            delivery.mockRejectedValueOnce({ data: { error: 'msg_too_long' } });
            await harness.service.replyToSlackPrompt('prompt-1');
            expect(delivery).toHaveBeenCalledTimes(2);
            const payload = card
                ? harness.stopAgentStream.mock.calls[1][0].chunks?.flatMap(
                      (chunk) => (chunk.type === 'blocks' ? chunk.blocks : []),
                  )
                : harness.postMessage.mock.calls[1][0].blocks;
            expectOneGroup(payload ?? []);
        });

        it('does not send the group again after persistence fails', async () => {
            const harness = setup({ card, refusals: [signIn] });
            harness.updateSlackResponseTs.mockRejectedValueOnce(
                new Error('Persistence failed'),
            );
            if (card) await harness.service.replyToSlackPrompt('prompt-1');
            else
                await expect(
                    harness.service.replyToSlackPrompt('prompt-1'),
                ).rejects.toThrow('Failed to generate response');
            expectOneGroup(harness.getDeliveredBlocks());
        });

        it('keeps the group in the fallback for a later answer message', async () => {
            const harness = setup({
                card,
                refusals: [signIn],
                response: 'Answer '.repeat(3000),
            });
            if (!card)
                harness.postMessage.mockResolvedValueOnce({
                    ok: true,
                    ts: 'first-ts',
                });
            harness.postMessage.mockRejectedValueOnce({
                data: { error: 'msg_blocks_too_long' },
            });
            await harness.service.replyToSlackPrompt('prompt-1');
            expectOneGroup(
                harness.postMessage.mock.calls.at(-1)?.[0].blocks ?? [],
            );
        });

        it('retains the refusal when the answer was not accepted by Slack', async () => {
            const harness = setup({ card, refusals: [signIn] });
            const delivery = card
                ? harness.stopAgentStream
                : harness.postMessage;
            delivery.mockRejectedValueOnce(new Error('Slack unavailable'));
            if (card) await harness.service.replyToSlackPrompt('prompt-1');
            else
                await expect(
                    harness.service.replyToSlackPrompt('prompt-1'),
                ).rejects.toThrow('Failed to generate response');
            const payload = card
                ? harness.stopAgentStream.mock.calls[1][0].chunks?.flatMap(
                      (chunk) => (chunk.type === 'blocks' ? chunk.blocks : []),
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
