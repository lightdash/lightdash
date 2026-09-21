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
