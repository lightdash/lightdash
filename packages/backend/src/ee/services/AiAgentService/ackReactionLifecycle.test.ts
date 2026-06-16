import { AiAgentService } from './AiAgentService';

// Avoid constructing the real MCP runtime client (and its transitive deps) when
// we new up the service with mostly-empty mocks below.
jest.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: jest.fn().mockImplementation(() => ({})),
}));

const buildSlackPrompt = (overrides: Record<string, unknown> = {}) => ({
    promptUuid: 'prompt-1',
    organizationUuid: 'org-1',
    projectUuid: 'proj-1',
    threadUuid: 'thread-1',
    slackChannelId: 'C123',
    promptSlackTs: '1700000000.000100',
    slackThreadTs: '1700000000.000000',
    createdByUserUuid: 'user-1',
    ...overrides,
});

const buildService = () => {
    const slackClient = {
        addReaction: jest.fn().mockResolvedValue(undefined),
        removeReaction: jest.fn().mockResolvedValue(undefined),
    };
    const aiAgentModel = {
        findSlackPrompt: jest.fn().mockResolvedValue(buildSlackPrompt()),
    };
    const service = new AiAgentService({
        slackClient,
        aiAgentModel,
        lightdashConfig: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { service, slackClient, aiAgentModel };
};

describe('AiAgentService :eyes: ack reaction lifecycle', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('adds the :eyes: ack reaction on app_mention', async () => {
        const { service } = buildService();
        const reactionsAdd = jest.fn().mockResolvedValue({});
        await service.handleAppMention({
            event: { channel: 'C123', ts: 'ts-1', text: 'hi', user: 'U1' },
            // No teamId -> handler returns right after the early ack reaction.
            context: {},
            say: jest.fn(),
            client: { reactions: { add: reactionsAdd } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        expect(reactionsAdd).toHaveBeenCalledWith({
            channel: 'C123',
            timestamp: 'ts-1',
            name: 'eyes',
        });
    });

    it('removes the :eyes: reaction after a successful reply', async () => {
        const { service, slackClient } = buildService();
        jest.spyOn(
            service as unknown as {
                generateSlackPromptReply: () => Promise<void>;
            },
            'generateSlackPromptReply',
        ).mockResolvedValue(undefined);

        await service.replyToSlackPrompt('prompt-1');

        expect(slackClient.removeReaction).toHaveBeenCalledWith({
            organizationUuid: 'org-1',
            channel: 'C123',
            timestamp: '1700000000.000100',
            name: 'eyes',
        });
    });

    it('removes the :eyes: reaction after a failed reply', async () => {
        const { service, slackClient } = buildService();
        jest.spyOn(
            service as unknown as {
                generateSlackPromptReply: () => Promise<void>;
            },
            'generateSlackPromptReply',
        ).mockRejectedValue(new Error('boom'));

        await expect(service.replyToSlackPrompt('prompt-1')).rejects.toThrow(
            'boom',
        );
        expect(slackClient.removeReaction).toHaveBeenCalledTimes(1);
    });

    it('does not fail the prompt when reaction cleanup fails', async () => {
        const { service, slackClient } = buildService();
        jest.spyOn(
            service as unknown as {
                generateSlackPromptReply: () => Promise<void>;
            },
            'generateSlackPromptReply',
        ).mockResolvedValue(undefined);
        slackClient.removeReaction.mockRejectedValue(
            new Error('missing_scope'),
        );

        await expect(
            service.replyToSlackPrompt('prompt-1'),
        ).resolves.toBeUndefined();
    });
});
