import { ParameterError } from '@lightdash/common';
import type {
    AiAgentModel,
    AiPromptResponseState,
} from '../../models/AiAgentModel';
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

type ShutdownHarness = {
    beginStreamPreparation: () => void;
    endStreamPreparation: () => void;
    trackStreamPrompt: (
        promptUuid: string,
        responseState: AiPromptResponseState,
    ) => void;
    persistTrackedPromptUpdate: (
        update: Parameters<AiAgentModel['updateModelResponse']>[0],
    ) => Promise<void> | undefined;
    failInFlightStreamedPrompts: () => Promise<void>;
};

type PromptResolutionOptions = {
    resetErrorForStreamRetry: boolean;
    onPromptResolved: (
        promptUuid: string,
        state: AiPromptResponseState,
    ) => void;
};

type PrivateService = {
    prepareAgentThreadResponse: (
        user: unknown,
        options: PromptResolutionOptions,
    ) => Promise<unknown>;
    generateOrStreamAgentResponse: (...args: unknown[]) => Promise<unknown>;
};

const pendingState: AiPromptResponseState = {
    respondedAt: null,
    response: null,
    errorMessage: null,
};

const createDeferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

const buildService = () => {
    const updateModelResponse = vi.fn().mockResolvedValue(undefined);
    const failPendingPrompts = vi
        .fn()
        .mockImplementation(async (promptUuids: string[]) => promptUuids);
    const service = new AiAgentService({
        aiAgentModel: {
            updateModelResponse,
            failPendingPrompts,
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

    return {
        instance: service,
        service: service as unknown as ShutdownHarness,
        updateModelResponse,
        failPendingPrompts,
    };
};

describe('AiAgentService streamed prompt shutdown', () => {
    it('wires prompt resolution into shutdown through the public stream flow', async () => {
        const { instance, service, failPendingPrompts } = buildService();
        const privateService = instance as unknown as PrivateService;
        const preparation = createDeferred();
        const generateResponse = vi
            .spyOn(privateService, 'generateOrStreamAgentResponse')
            .mockResolvedValue({});
        vi.spyOn(
            privateService,
            'prepareAgentThreadResponse',
        ).mockImplementation(async (_user, options) => {
            expect(options.resetErrorForStreamRetry).toBe(true);
            options.onPromptResolved('prompt-uuid', pendingState);
            await preparation.promise;
            return {
                user: { organizationUuid: 'organization-uuid' },
                chatHistoryMessages: [],
                prompt: { promptUuid: 'prompt-uuid', response: null },
                compaction: null,
            };
        });

        const stream = instance.streamAgentThreadResponse(
            { organizationUuid: 'organization-uuid' } as never,
            {
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                enableSqlMode: false,
                toolHints: [],
            },
        );
        await Promise.resolve();
        await service.failInFlightStreamedPrompts();
        preparation.resolve();

        await expect(stream).rejects.toThrow(
            'Something went wrong while processing your request. Please try again.',
        );
        expect(failPendingPrompts).toHaveBeenCalledWith(
            ['prompt-uuid'],
            'The server restarted while generating this response. Please try again.',
        );
        expect(generateResponse).not.toHaveBeenCalled();
    });

    it('persists a post-resolution preparation failure', async () => {
        const { instance, updateModelResponse } = buildService();
        const privateService = instance as unknown as PrivateService;
        vi.spyOn(
            privateService,
            'prepareAgentThreadResponse',
        ).mockImplementation(async (_user, options) => {
            options.onPromptResolved('prompt-uuid', pendingState);
            throw new Error('Preparation failed');
        });

        await expect(
            instance.streamAgentThreadResponse(
                { organizationUuid: 'organization-uuid' } as never,
                {
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                    enableSqlMode: false,
                    toolHints: [],
                },
            ),
        ).rejects.toThrow(
            'Something went wrong while processing your request. Please try again.',
        );

        expect(updateModelResponse).toHaveBeenCalledWith(
            {
                promptUuid: 'prompt-uuid',
                errorMessage:
                    'Something went wrong while processing your request. Please try again.',
            },
            { onlyIfPending: true },
        );
    });

    it('closes admission and waits for an admitted prompt before failing it', async () => {
        const { service, failPendingPrompts } = buildService();
        service.beginStreamPreparation();

        const shutdown = service.failInFlightStreamedPrompts();
        await Promise.resolve();

        expect(() => service.beginStreamPreparation()).toThrow(ParameterError);
        expect(failPendingPrompts).not.toHaveBeenCalled();

        service.trackStreamPrompt('prompt-uuid', pendingState);
        service.endStreamPreparation();
        await shutdown;

        expect(failPendingPrompts).toHaveBeenCalledWith(
            ['prompt-uuid'],
            'The server restarted while generating this response. Please try again.',
        );
    });

    it('lets a terminal write that started first win the shutdown race', async () => {
        const { service, updateModelResponse, failPendingPrompts } =
            buildService();
        const terminalWrite = createDeferred();
        updateModelResponse.mockReturnValueOnce(terminalWrite.promise);
        service.trackStreamPrompt('prompt-uuid', pendingState);

        const update = service.persistTrackedPromptUpdate({
            promptUuid: 'prompt-uuid',
            response: 'Completed response',
        });
        const shutdown = service.failInFlightStreamedPrompts();
        expect(failPendingPrompts).not.toHaveBeenCalled();

        terminalWrite.resolve();
        await Promise.all([update, shutdown]);

        expect(updateModelResponse).toHaveBeenCalledWith(
            {
                promptUuid: 'prompt-uuid',
                response: 'Completed response',
            },
            { onlyIfPending: true },
        );
        expect(failPendingPrompts).not.toHaveBeenCalled();
    });

    it('ignores a terminal callback after shutdown wins', async () => {
        const { service, updateModelResponse } = buildService();
        const retryState: AiPromptResponseState = {
            respondedAt: '2026-08-04 08:00:00+00',
            response: null,
            errorMessage: 'Previous failure',
        };
        service.trackStreamPrompt('retry-prompt-uuid', retryState);

        await service.failInFlightStreamedPrompts();
        const lateUpdate = service.persistTrackedPromptUpdate({
            promptUuid: 'retry-prompt-uuid',
            response: 'Late response',
        });

        expect(lateUpdate).toBeUndefined();
        expect(updateModelResponse).not.toHaveBeenCalled();
    });

    it('bounds the preparation barrier during shutdown', async () => {
        vi.useFakeTimers();
        const { service, failPendingPrompts } = buildService();
        service.beginStreamPreparation();

        const shutdown = service.failInFlightStreamedPrompts();
        await vi.advanceTimersByTimeAsync(5_000);
        await shutdown;

        expect(failPendingPrompts).not.toHaveBeenCalled();
        service.endStreamPreparation();
        vi.useRealTimers();
    });
});
