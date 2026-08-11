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

type PreparationOptions = {
    agentUuid: string;
    threadUuid: string;
    resetErrorForStreamRetry?: boolean;
};

type PrivateService = {
    prepareAgentThreadResponse: (
        user: unknown,
        options: PreparationOptions,
    ) => Promise<unknown>;
    checkAgentThreadAccess: (...args: unknown[]) => Promise<boolean>;
    maybeCompactThreadBeforeResponse: (...args: unknown[]) => Promise<null>;
    getChatHistoryFromThreadMessages: (...args: unknown[]) => Promise<unknown>;
};

const user = {
    organizationUuid: 'organization-uuid',
    userUuid: 'user-uuid',
};

const buildService = (promptState: {
    respondedAt: Date | null;
    response: string | null;
    errorMessage: string | null;
}) => {
    const resetPromptResponseForRetry = vi.fn().mockResolvedValue(true);
    const deleteAiPromptInterrupt = vi.fn().mockResolvedValue(undefined);
    const service = new AiAgentService({
        lightdashConfig: {
            ai: { copilot: { embeddingEnabled: false } },
        },
        aiAgentModel: {
            getThread: vi.fn().mockResolvedValue({
                agentUuid: 'agent-uuid',
                user: { uuid: 'user-uuid' },
            }),
            getAgent: vi.fn().mockResolvedValue({
                uuid: 'agent-uuid',
                projectUuid: 'project-uuid',
            }),
            getThreadMessages: vi
                .fn()
                .mockResolvedValue([{ ai_prompt_uuid: 'prompt-uuid' }]),
            findWebAppPrompt: vi.fn().mockResolvedValue({
                promptUuid: 'prompt-uuid',
                threadUuid: 'thread-uuid',
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                ...promptState,
            }),
            resetPromptResponseForRetry,
            deleteAiPromptInterrupt,
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

    return {
        privateService,
        resetPromptResponseForRetry,
        deleteAiPromptInterrupt,
    };
};

const prepare = (
    privateService: PrivateService,
    resetErrorForStreamRetry: boolean,
) =>
    privateService.prepareAgentThreadResponse(user, {
        agentUuid: 'agent-uuid',
        threadUuid: 'thread-uuid',
        resetErrorForStreamRetry,
    });

describe('prepareAgentThreadResponse interrupt clearing', () => {
    it('deletes the stale interrupt when a retry claims an errored prompt', async () => {
        const {
            privateService,
            resetPromptResponseForRetry,
            deleteAiPromptInterrupt,
        } = buildService({
            respondedAt: new Date(),
            response: null,
            errorMessage: 'The agent finished without writing a response.',
        });

        await prepare(privateService, true);

        expect(resetPromptResponseForRetry).toHaveBeenCalledWith(
            'prompt-uuid',
            expect.anything(),
        );
        expect(deleteAiPromptInterrupt).toHaveBeenCalledWith('prompt-uuid');
    });

    it('keeps the interrupt for an in-flight prompt on a stream start', async () => {
        const { privateService, deleteAiPromptInterrupt } = buildService({
            respondedAt: null,
            response: null,
            errorMessage: null,
        });

        await prepare(privateService, true);

        expect(deleteAiPromptInterrupt).not.toHaveBeenCalled();
    });

    it('keeps the interrupt when preparation is not a stream retry', async () => {
        const { privateService, deleteAiPromptInterrupt } = buildService({
            respondedAt: new Date(),
            response: null,
            errorMessage: 'Some error',
        });

        await prepare(privateService, false);

        expect(deleteAiPromptInterrupt).not.toHaveBeenCalled();
    });
});
