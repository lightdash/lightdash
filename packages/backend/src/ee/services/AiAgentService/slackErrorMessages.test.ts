import { FeatureFlags } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { MCP_PERMISSION_MESSAGE } from '../ai/utils/mcpErrors';
import { AiAgentService } from './AiAgentService';

const setup = (
    enabled: boolean,
    error = new Error('The tenant role cannot read the resource'),
) => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () =>
        Response.json({
            model: 'test',
            answers: {
                category: {
                    type: 'choice',
                    choice: 'permissions',
                    confidence: 0.99,
                    probabilities: { permissions: 1 },
                },
            },
        }),
    );
    vi.stubGlobal('fetch', request);
    const featureFlagService = { get: vi.fn().mockResolvedValue({ enabled }) };
    const postMessage = vi.fn().mockResolvedValue({ ok: true });
    const service = new AiAgentService({
        lightdashConfig: {
            ...lightdashConfigMock,
            ai: {
                ...lightdashConfigMock.ai,
                decisions: {
                    apiKey: `test-${enabled}-${error.message}`,
                    model: 'test',
                    timeoutMs: 100,
                },
            },
        },
        featureFlagService,
        slackClient: { postMessage },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockRejectedValue(error),
        },
        aiAgentModel: {
            findSlackPrompt: vi.fn().mockResolvedValue({
                createdByUserUuid: 'user-1',
                organizationUuid: 'org-1',
                slackChannelId: 'channel-1',
                promptSlackTs: 'prompt-ts',
                slackThreadTs: 'thread-ts',
            }),
        },
        orgAiCopilotConfigResolver: {
            isOrgBedrockRouted: async () => false,
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    return { service, request, postMessage, featureFlagService };
};

afterEach(() => vi.unstubAllGlobals());

describe('Slack error reply', () => {
    it.each([false, true])(
        'uses the organization decision flag (%s) on the actual failure path',
        async (enabled) => {
            const { service, request, postMessage, featureFlagService } =
                setup(enabled);
            await expect(
                service.replyToSlackPrompt('prompt-1'),
            ).rejects.toThrow('Failed to generate response');
            expect(featureFlagService.get).toHaveBeenCalledExactlyOnceWith({
                user: { userUuid: 'user-1', organizationUuid: 'org-1' },
                featureFlagId: FeatureFlags.AiAgentFastDecisions,
            });
            expect(postMessage).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    organizationUuid: 'org-1',
                    channel: 'channel-1',
                    thread_ts: 'thread-ts',
                    text: enabled
                        ? expect.stringContaining('Check your permissions')
                        : expect.not.stringContaining('Check your permissions'),
                }),
            );
            expect(request).toHaveBeenCalledTimes(enabled ? 1 : 0);
        },
    );

    it('retains the error reply when flag resolution fails', async () => {
        const { service, request, postMessage, featureFlagService } =
            setup(true);
        featureFlagService.get.mockRejectedValue(
            new Error('flag service unavailable'),
        );
        await expect(service.replyToSlackPrompt('prompt-1')).rejects.toThrow(
            'Failed to generate response',
        );
        expect(postMessage).toHaveBeenCalledOnce();
        expect(request).not.toHaveBeenCalled();
    });

    it('does not call the provider for a known MCP failure', async () => {
        const { service, request, postMessage, featureFlagService } = setup(
            true,
            new Error('MCP HTTP Transport Error: HTTP 403 Forbidden'),
        );
        await expect(service.replyToSlackPrompt('prompt-1')).rejects.toThrow(
            'Failed to generate response',
        );
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ text: `🔴 ${MCP_PERMISSION_MESSAGE}` }),
        );
        expect(featureFlagService.get).toHaveBeenCalledExactlyOnceWith({
            user: { userUuid: 'user-1', organizationUuid: 'org-1' },
            featureFlagId: FeatureFlags.AiAgentFastDecisions,
        });
        expect(request).not.toHaveBeenCalled();
    });
});

describe('rejected Slack SQL approval resume', () => {
    const setupRejectedResume = () => {
        const createToolResults = vi.fn().mockResolvedValue([]);
        const postMessage = vi.fn().mockResolvedValue({ ok: true });
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
        const threadMessages = [
            {
                ai_prompt_uuid: 'prompt-1',
                prompt: 'Run the query',
                response: null,
                error_message: null,
                human_score: null,
                human_feedback: null,
            },
        ];
        const service = new AiAgentService({
            lightdashConfig: lightdashConfigMock,
            slackClient: { postMessage },
            userModel: {
                findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
                    userUuid: 'user-1',
                    organizationUuid: 'org-1',
                }),
            },
            aiAgentModel: {
                findSlackPrompt: vi.fn().mockResolvedValue(slackPrompt),
                getThreadMessages: vi.fn().mockResolvedValue(threadMessages),
                findThread: vi.fn().mockResolvedValue({ agentUuid: null }),
                getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
                getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([
                    {
                        toolCall: {
                            toolCallId: 'sql-call-1',
                            toolName: 'runSql',
                            toolArgs: { sql: 'SELECT 1', limit: 10 },
                        },
                        toolResult: null,
                        approvalDecision: 'rejected',
                    },
                ]),
                createToolResults,
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
        const reply = vi.spyOn(
            service as unknown as {
                replyToSlackPromptWithStatus: () => Promise<boolean>;
            },
            'replyToSlackPromptWithStatus',
        );

        return { service, reply, createToolResults };
    };

    it('persists the rejected result only after the Slack reply succeeds', async () => {
        const { service, reply, createToolResults } = setupRejectedResume();
        reply.mockResolvedValue(true);

        await service.replyToSlackPrompt('prompt-1');

        expect(reply).toHaveBeenCalledOnce();
        expect(createToolResults).toHaveBeenCalledExactlyOnceWith([
            {
                promptUuid: 'prompt-1',
                toolCallId: 'sql-call-1',
                toolName: 'runSql',
                result: 'User rejected this SQL execution. Do not retry the same query; ask the user what they would like instead.',
                metadata: { status: 'rejected' },
            },
        ]);
        expect(reply.mock.invocationCallOrder[0]).toBeLessThan(
            createToolResults.mock.invocationCallOrder[0],
        );
    });

    it('leaves the rejection unpersisted when Slack delivery fails', async () => {
        const { service, reply, createToolResults } = setupRejectedResume();
        reply.mockRejectedValue(new Error('Slack delivery failed'));

        await expect(service.replyToSlackPrompt('prompt-1')).rejects.toThrow(
            'Failed to generate response',
        );
        expect(createToolResults).not.toHaveBeenCalled();
    });

    it('leaves the rejection unpersisted when Slack handles a failed delivery', async () => {
        const { service, reply, createToolResults } = setupRejectedResume();
        reply.mockResolvedValue(false);

        await service.replyToSlackPrompt('prompt-1');

        expect(createToolResults).not.toHaveBeenCalled();
    });

    it('does not fail the delivered reply when persisting the rejection fails', async () => {
        const { service, reply, createToolResults } = setupRejectedResume();
        reply.mockResolvedValue(true);
        createToolResults.mockRejectedValue(new Error('insert failed'));

        await expect(
            service.replyToSlackPrompt('prompt-1'),
        ).resolves.toBeUndefined();

        expect(createToolResults).toHaveBeenCalledOnce();
    });
});
