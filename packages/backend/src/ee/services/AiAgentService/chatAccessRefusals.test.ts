import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    ParameterError,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { type AiPromptResponseState } from '../../models/AiAgentModel';
import { AiAgentService } from './AiAgentService';

const genericMessage =
    'Something went wrong while processing your request. Please try again.';
const prompt = {
    promptUuid: 'prompt',
    projectUuid: 'project',
    agentUuid: 'agent',
    threadUuid: 'thread',
    response: null,
    respondedAt: null,
    errorMessage: null,
};

const setup = (error: Error, phase: 'preparation' | 'generation') => {
    const updateModelResponse = vi.fn().mockResolvedValue(true);
    const service = new AiAgentService({
        aiAgentModel: {
            updateModelResponse,
            findPromptContext: vi.fn().mockResolvedValue(null),
        },
        lightdashConfig: {
            ai: { promptInputRequestClassifier: { enabled: false } },
        },
        agentPermissionService: {
            assertOperation: vi.fn().mockRejectedValue(error),
        },
        aiOrganizationSettingsService: {
            isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    Object.assign(service, {
        prepareAgentThreadResponse: vi.fn(
            async (
                _user,
                options: {
                    onPromptResolved?: (
                        uuid: string,
                        state: AiPromptResponseState,
                    ) => void;
                },
            ) => {
                options.onPromptResolved?.(prompt.promptUuid, prompt);
                if (phase === 'preparation') throw error;
                return {
                    user: defaultSessionUser,
                    chatHistoryMessages: [],
                    prompt,
                    compaction: null,
                };
            },
        ),
        createAuditedAbility: vi.fn().mockReturnValue({ can: () => false }),
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        getAgentSettings: vi
            .fn()
            .mockResolvedValue({ uuid: 'agent', projectUuid: 'project' }),
    });
    return {
        updateModelResponse,
        stream: () =>
            service.streamAgentThreadResponse(defaultSessionUser, {
                agentUuid: 'agent',
                threadUuid: 'thread',
                toolHints: [],
            }),
        generate: () =>
            service.generateAgentThreadResponse(defaultSessionUser, {
                agentUuid: 'agent',
                threadUuid: 'thread',
                aiCreditCheck: null,
            }),
    };
};

describe.each(['preparation', 'generation'] as const)(
    'chat refusal during %s',
    (phase) => {
        it.each([
            AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
        ])(
            'preserves the stream refusal and persists its message: %s',
            async (reason) => {
                const error = new AiAccessRefusedError(reason);
                const h = setup(error, phase);
                await expect(h.stream()).rejects.toBe(error);
                expect(h.updateModelResponse).toHaveBeenCalledWith(
                    {
                        promptUuid: 'prompt',
                        errorMessage: error.refusal.message,
                    },
                    { onlyIfPending: true },
                );
            },
        );

        it('preserves the non-stream refusal and persists its message', async () => {
            const error = new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            );
            const h = setup(error, phase);
            await expect(h.generate()).rejects.toBe(error);
            expect(h.updateModelResponse).toHaveBeenCalledWith(
                { promptUuid: 'prompt', errorMessage: error.refusal.message },
                { onlyIfPending: true },
            );
        });

        it('keeps ordinary stream errors generic', async () => {
            const h = setup(new Error('Internal detail'), phase);
            await expect(h.stream()).rejects.toEqual(
                new ParameterError(genericMessage),
            );
            if (phase === 'preparation') {
                expect(h.updateModelResponse).toHaveBeenCalledWith(
                    { promptUuid: 'prompt', errorMessage: genericMessage },
                    { onlyIfPending: true },
                );
            } else {
                expect(h.updateModelResponse).not.toHaveBeenCalled();
            }
        });

        it('keeps ordinary non-stream errors generic', async () => {
            const h = setup(new Error('Internal detail'), phase);
            await expect(h.generate()).rejects.toEqual(
                new ParameterError(genericMessage),
            );
            expect(h.updateModelResponse).not.toHaveBeenCalled();
        });
    },
);
