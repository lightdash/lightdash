import { ForbiddenError } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', async (importOriginal) => ({
    ...(await importOriginal()),
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

type PrivateService = {
    prepareAgentThreadResponse: (
        user: unknown,
        options: {
            agentUuid: string;
            threadUuid: string;
            aiCreditCheck: null;
        },
    ) => Promise<unknown>;
    checkAgentThreadAccess: (...args: unknown[]) => Promise<boolean>;
    maybeCompactThreadBeforeResponse: (...args: unknown[]) => Promise<null>;
    getChatHistoryFromThreadMessages: (...args: unknown[]) => Promise<unknown>;
};

const user = {
    organizationUuid: 'organization-uuid',
    userUuid: 'user-uuid',
};

const buildService = (createdFrom: 'slack' | 'web_app') => {
    const getThreadMessages = vi
        .fn()
        .mockResolvedValue([{ ai_prompt_uuid: 'prompt-uuid' }]);
    const service = new AiAgentService({
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        orgAiCopilotConfigResolver: {
            getDecisionClient: async () => undefined,
        },
        lightdashConfig: {
            ai: { copilot: { embeddingEnabled: false } },
        },
        aiAgentModel: {
            getThread: vi.fn().mockResolvedValue({
                agentUuid: 'agent-uuid',
                createdFrom,
                user: { uuid: 'user-uuid' },
            }),
            getAgent: vi.fn().mockResolvedValue({
                uuid: 'agent-uuid',
                projectUuid: 'project-uuid',
            }),
            getThreadMessages,
            findWebAppPrompt: vi.fn().mockResolvedValue({
                promptUuid: 'prompt-uuid',
                threadUuid: 'thread-uuid',
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                battleProfile: null,
                respondedAt: null,
                response: null,
                errorMessage: null,
            }),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

    const privateService = service as unknown as PrivateService;
    vi.spyOn(privateService, 'checkAgentThreadAccess').mockResolvedValue(true);
    vi.spyOn(
        privateService,
        'maybeCompactThreadBeforeResponse',
    ).mockResolvedValue(null);
    vi.spyOn(
        privateService,
        'getChatHistoryFromThreadMessages',
    ).mockResolvedValue([]);

    return { privateService, getThreadMessages };
};

const prepare = (privateService: PrivateService) =>
    privateService.prepareAgentThreadResponse(user, {
        agentUuid: 'agent-uuid',
        threadUuid: 'thread-uuid',
        aiCreditCheck: null,
    });

describe('generating a response on a Slack-origin thread', () => {
    it('is refused with guidance to continue in Slack', async () => {
        const { privateService, getThreadMessages } = buildService('slack');

        await expect(prepare(privateService)).rejects.toThrowError(
            new ForbiddenError(
                'This thread was created in Slack. Continue the conversation in Slack.',
            ),
        );
        expect(getThreadMessages).not.toHaveBeenCalled();
    });

    it('still proceeds for web app threads', async () => {
        const { privateService } = buildService('web_app');

        await expect(prepare(privateService)).resolves.toBeDefined();
    });
});
