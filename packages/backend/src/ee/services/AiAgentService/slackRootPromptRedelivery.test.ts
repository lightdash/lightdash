import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

vi.mock('../ai/models', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../ai/models')>()),
    getModel: () => ({
        model: { modelId: 'test-model' },
        callOptions: {},
        providerOptions: null,
    }),
}));

const CHANNEL_ID = 'C123';
const ROOT_TS = '1700000000.000100';
const REPLY_TS = '1700000001.000100';
const EXISTING_THREAD_UUID = 'existing-thread-uuid';

const buildService = ({
    existingThreadUuid,
}: {
    existingThreadUuid: string | undefined;
}) => {
    const findThreadUuidBySlackChannelIdAndThreadTs = vi
        .fn()
        .mockResolvedValue(existingThreadUuid);
    const createSlackThread = vi.fn();
    const createSlackThreadWithUserMessage = vi.fn().mockResolvedValue({
        threadUuid: 'new-thread-uuid',
        storageVersion: 3,
        message: { uuid: 'new-message-uuid', threadSeq: 1 },
    });
    const createSlackUserMessage = vi
        .fn()
        .mockResolvedValue({ uuid: 'appended-message-uuid', threadSeq: 3 });
    const service = new AiAgentService({
        aiAgentModel: {
            existsSlackPromptByChannelIdAndPromptTs: vi
                .fn()
                .mockResolvedValue(false),
            findThreadUuidBySlackChannelIdAndThreadTs,
            createSlackThread,
            createSlackThreadWithPrompt: vi.fn(),
            createSlackPrompt: vi.fn(),
        },
        aiAgentV3Model: {
            hasSlackUserMessageByChannelAndTs: vi.fn().mockResolvedValue(false),
            createSlackThread: vi.fn(),
            createSlackThreadWithUserMessage,
            createSlackUserMessage,
        },
        userModel: {
            getUserDetailsByUuid: vi.fn().mockResolvedValue({
                userUuid: 'user-uuid',
                organizationUuid: 'org-uuid',
            }),
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        aiAgentThreadRepository: {
            getStorageVersion: vi.fn().mockResolvedValue(3),
        },
        aiOrganizationSettingsService: {
            getDefaultModelConfig: vi.fn().mockResolvedValue(null),
        },
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi
                .fn()
                .mockResolvedValue({ defaultProvider: 'openai' }),
        },
        analytics: { track: vi.fn() },
        lightdashConfig: {
            siteUrl: 'https://example.com',
            ai: { copilot: {} },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return {
        createSlackThread,
        createSlackThreadWithUserMessage,
        createSlackUserMessage,
        findThreadUuidBySlackChannelIdAndThreadTs,
        service,
    };
};

const createPrompt = (
    service: AiAgentService,
    slackThreadTs: string | undefined,
    promptSlackTs: string,
) =>
    service.createSlackPrompt({
        userUuid: 'user-uuid',
        projectUuid: 'project-uuid',
        slackUserId: 'U123',
        slackChannelId: CHANNEL_ID,
        slackThreadTs,
        prompt: 'how many orders?',
        promptSlackTs,
        agentUuid: null,
    });

describe('Slack root prompt redelivery', () => {
    it('adopts the thread a previous delivery of the same root event created', async () => {
        const {
            createSlackThread,
            createSlackThreadWithUserMessage,
            createSlackUserMessage,
            findThreadUuidBySlackChannelIdAndThreadTs,
            service,
        } = buildService({ existingThreadUuid: EXISTING_THREAD_UUID });

        const result = await createPrompt(service, undefined, ROOT_TS);

        expect(findThreadUuidBySlackChannelIdAndThreadTs).toHaveBeenCalledWith(
            CHANNEL_ID,
            ROOT_TS,
        );
        expect(createSlackThread).not.toHaveBeenCalled();
        expect(createSlackThreadWithUserMessage).not.toHaveBeenCalled();
        expect(createSlackUserMessage).toHaveBeenCalledWith(
            expect.objectContaining({ threadUuid: EXISTING_THREAD_UUID }),
        );
        expect(result).toMatchObject({
            createdThread: false,
            threadUuid: EXISTING_THREAD_UUID,
            promptUuid: 'appended-message-uuid',
        });
    });

    it('creates a new root thread and its first message in one call', async () => {
        const {
            createSlackThread,
            createSlackThreadWithUserMessage,
            createSlackUserMessage,
            service,
        } = buildService({ existingThreadUuid: undefined });

        const result = await createPrompt(service, undefined, ROOT_TS);

        expect(createSlackThread).not.toHaveBeenCalled();
        expect(createSlackUserMessage).not.toHaveBeenCalled();
        expect(createSlackThreadWithUserMessage).toHaveBeenCalledWith({
            thread: expect.objectContaining({
                slackChannelId: CHANNEL_ID,
                slackThreadTs: ROOT_TS,
            }),
            message: expect.objectContaining({ promptSlackTs: ROOT_TS }),
        });
        expect(result).toMatchObject({
            createdThread: true,
            threadUuid: 'new-thread-uuid',
            promptUuid: 'new-message-uuid',
        });
    });

    it('looks a threaded reply up by its thread ts, not its own ts', async () => {
        const { findThreadUuidBySlackChannelIdAndThreadTs, service } =
            buildService({ existingThreadUuid: EXISTING_THREAD_UUID });

        await createPrompt(service, ROOT_TS, REPLY_TS);

        expect(findThreadUuidBySlackChannelIdAndThreadTs).toHaveBeenCalledWith(
            CHANNEL_ID,
            ROOT_TS,
        );
    });
});
