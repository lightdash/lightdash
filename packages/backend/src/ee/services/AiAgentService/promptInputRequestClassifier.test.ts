import { generateObject } from 'ai';
import type { AiAgentPromptInputRequestClassifiedEvent } from '../../../analytics/LightdashAnalytics';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { AiAgentModel } from '../../models/AiAgentModel';
import { getModel } from '../ai/models';
import {
    classifyPromptInputRequest,
    promptInputRequestClassifierOutputSchema,
    responseMatchesPromptInputRequestGate,
    runPromptInputRequestClassification,
    shouldClassifyPromptInputRequestForUpdate,
} from './promptInputRequestClassifier';
import { promptInputRequestClassifierEvalCases } from './promptInputRequestClassifier.fixtures';

vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('../ai/models', () => ({ getModel: vi.fn() }));

const generateObjectMock = vi.mocked(generateObject);
const getModelMock = vi.mocked(getModel);
const model = {
    model: { modelId: 'claude-haiku-4-5', provider: 'anthropic.messages' },
    callOptions: {},
    providerOptions: {},
    keyManagement: 'lightdash-managed',
};
const orgAiCopilotConfigResolver = {
    getReviewJudgeAvailability: vi.fn().mockResolvedValue({
        hasActiveByoKey: false,
        canJudgeOnByoKey: false,
    }),
    getCopilotConfig: vi.fn(),
};
const context = {
    organizationUuid: 'organization-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
};
const updatePromptNeedsUserInput =
    vi.fn<AiAgentModel['updatePromptNeedsUserInput']>();
const track =
    vi.fn<(event: AiAgentPromptInputRequestClassifiedEvent) => void>();

describe('prompt input request gate', () => {
    it.each(promptInputRequestClassifierEvalCases)(
        'matches $name as expected',
        ({ response, gateFired }) => {
            expect(responseMatchesPromptInputRequestGate(response)).toBe(
                gateFired,
            );
        },
    );

    it('records the gate evaluation distribution', () => {
        const gatedCases = promptInputRequestClassifierEvalCases.filter(
            ({ response }) => responseMatchesPromptInputRequestGate(response),
        );
        const falsePositives = gatedCases.filter(({ blocking }) => !blocking);
        const nonBlockingCases = promptInputRequestClassifierEvalCases.filter(
            ({ blocking }) => !blocking,
        );

        expect(promptInputRequestClassifierEvalCases).toHaveLength(24);
        expect(gatedCases).toHaveLength(16);
        expect(falsePositives).toHaveLength(4);
        expect(nonBlockingCases).toHaveLength(12);
    });
});

describe('prompt input request completion trigger', () => {
    it('ignores intermediate response writes', () => {
        expect(
            shouldClassifyPromptInputRequestForUpdate({
                promptUuid: 'prompt-uuid',
                response: 'Draft response',
            }),
        ).toBe(false);
    });

    it('accepts final response writes', () => {
        expect(
            shouldClassifyPromptInputRequestForUpdate({
                promptUuid: 'prompt-uuid',
                response: 'Final response',
                tokenUsage: { totalTokens: 123, finalStepTotalTokens: 123 },
            }),
        ).toBe(true);
    });

    it('ignores failed response writes', () => {
        expect(
            shouldClassifyPromptInputRequestForUpdate({
                promptUuid: 'prompt-uuid',
                errorMessage: 'Provider failed',
            }),
        ).toBe(false);
    });
});

describe('prompt input request classifier', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getModelMock.mockReturnValue(model as never);
    });

    it('persists a free negative result when the gate does not fire', async () => {
        const result = await classifyPromptInputRequest({
            ...context,
            response: 'Revenue increased by 12%.',
            orgAiCopilotConfigResolver,
            instanceCopilotConfig: lightdashConfigMock.ai.copilot,
        });

        expect(result).toMatchObject({
            gateFired: false,
            classified: false,
            model: null,
            confidence: null,
        });
        expect(getModelMock).not.toHaveBeenCalled();
        expect(generateObjectMock).not.toHaveBeenCalled();
    });

    it('asks the fast judge for a strict blocking verdict', async () => {
        generateObjectMock.mockResolvedValue({
            object: { needsUserInput: true, confidence: 0.92 },
            usage: {},
        } as never);

        const result = await classifyPromptInputRequest({
            ...context,
            response: 'Which project did you mean?',
            orgAiCopilotConfigResolver,
            instanceCopilotConfig: lightdashConfigMock.ai.copilot,
        });

        expect(getModelMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ useFastModel: true }),
        );
        expect(generateObjectMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: model.model,
                schema: promptInputRequestClassifierOutputSchema,
                abortSignal: expect.any(AbortSignal),
                messages: [
                    expect.objectContaining({
                        role: 'system',
                        content: expect.stringContaining('blocking'),
                    }),
                    { role: 'user', content: 'Which project did you mean?' },
                ],
            }),
        );
        expect(result).toMatchObject({
            gateFired: true,
            classified: true,
            model: 'claude-haiku-4-5',
            confidence: 0.92,
        });
    });

    it('rejects output outside the strict schema', async () => {
        generateObjectMock.mockResolvedValue({
            object: { needsUserInput: 'yes', confidence: 2 },
            usage: {},
        } as never);

        await expect(
            classifyPromptInputRequest({
                ...context,
                response: 'Which project did you mean?',
                orgAiCopilotConfigResolver,
                instanceCopilotConfig: lightdashConfigMock.ai.copilot,
            }),
        ).resolves.toMatchObject({
            gateFired: true,
            classified: null,
            confidence: null,
        });
    });

    it('returns null when the model times out', async () => {
        const timeoutSignal = AbortSignal.abort(
            new DOMException('Timed out', 'TimeoutError'),
        );
        const timeoutSpy = vi
            .spyOn(AbortSignal, 'timeout')
            .mockReturnValue(timeoutSignal);
        generateObjectMock.mockImplementation(({ abortSignal }) =>
            Promise.reject(abortSignal?.reason),
        );

        await expect(
            classifyPromptInputRequest({
                ...context,
                response: 'Which project did you mean?',
                orgAiCopilotConfigResolver,
                instanceCopilotConfig: lightdashConfigMock.ai.copilot,
            }),
        ).resolves.toMatchObject({
            gateFired: true,
            classified: null,
            confidence: null,
        });
        expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    });

    it('returns null when the model fails', async () => {
        generateObjectMock.mockRejectedValue(new Error('provider failed'));

        await expect(
            classifyPromptInputRequest({
                ...context,
                response: 'Which project did you mean?',
                orgAiCopilotConfigResolver,
                instanceCopilotConfig: lightdashConfigMock.ai.copilot,
            }),
        ).resolves.toMatchObject({
            gateFired: true,
            classified: null,
            confidence: null,
        });
    });
});

describe('prompt input request classification run', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getModelMock.mockReturnValue(model as never);
        updatePromptNeedsUserInput.mockResolvedValue(true);
    });

    const runClassification = (enabled: boolean, response: string) =>
        runPromptInputRequestClassification({
            ...context,
            enabled,
            response,
            userUuid: 'user-uuid',
            orgAiCopilotConfigResolver,
            instanceCopilotConfig: lightdashConfigMock.ai.copilot,
            aiAgentModel: { updatePromptNeedsUserInput },
            analytics: { track },
        });

    it('does nothing while the kill switch is off', async () => {
        await runClassification(false, 'Which project did you mean?');

        expect(getModelMock).not.toHaveBeenCalled();
        expect(generateObjectMock).not.toHaveBeenCalled();
        expect(updatePromptNeedsUserInput).not.toHaveBeenCalled();
        expect(track).not.toHaveBeenCalled();
    });

    it('persists and tracks a gate miss without calling the model', async () => {
        await runClassification(true, 'Revenue increased by 12%.');

        expect(generateObjectMock).not.toHaveBeenCalled();
        expect(updatePromptNeedsUserInput).toHaveBeenCalledWith({
            promptUuid: 'prompt-uuid',
            needsUserInput: false,
            metadata: {
                gate: 'no_match',
                model: null,
                durationMs: expect.any(Number),
                confidence: null,
            },
        });
        expect(track).toHaveBeenCalledWith({
            event: 'ai_agent.prompt_input_request_classified',
            userId: 'user-uuid',
            properties: {
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                gateFired: false,
                classified: false,
                model: null,
                durationMs: expect.any(Number),
            },
        });
    });

    it('tracks a failed model call without persisting a verdict', async () => {
        generateObjectMock.mockRejectedValue(new Error('provider failed'));

        await runClassification(true, 'Which project did you mean?');

        expect(updatePromptNeedsUserInput).not.toHaveBeenCalled();
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    gateFired: true,
                    classified: null,
                    model: 'claude-haiku-4-5',
                }),
            }),
        );
    });

    it('records when the model disagrees with the gate', async () => {
        generateObjectMock.mockResolvedValue({
            object: { needsUserInput: false, confidence: 0.88 },
            usage: {},
        } as never);

        await runClassification(true, 'Want a chart of that too?');

        expect(updatePromptNeedsUserInput).toHaveBeenCalledWith({
            promptUuid: 'prompt-uuid',
            needsUserInput: false,
            metadata: {
                gate: 'match',
                model: 'claude-haiku-4-5',
                durationMs: expect.any(Number),
                confidence: 0.88,
            },
        });
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    gateFired: true,
                    classified: false,
                }),
            }),
        );
    });
});
