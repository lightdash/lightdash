import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { AiAgentModel } from '../../models/AiAgentModel';
import { AiAgentService } from './AiAgentService';

type ClassificationContext = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    userUuid: string;
};

type ServiceHarness = {
    trackStreamPrompt: (
        promptUuid: string,
        responseState: {
            respondedAt: string | null;
            response: string | null;
            errorMessage: string | null;
        },
    ) => void;
    persistTrackedPromptUpdate: (
        update: Parameters<AiAgentModel['updateModelResponse']>[0],
        classificationContext: ClassificationContext,
    ) => Promise<boolean> | undefined;
    classifyPromptInputRequestAfterResponse: (args: unknown) => void;
};

describe('AiAgentService prompt input classification persistence', () => {
    const classificationContext = {
        organizationUuid: 'organization-uuid',
        projectUuid: 'project-uuid',
        agentUuid: 'agent-uuid',
        threadUuid: 'thread-uuid',
        userUuid: 'user-uuid',
    };

    const terminalUpdate = {
        promptUuid: 'prompt-uuid',
        response: 'Which project did you mean?',
        tokenUsage: { totalTokens: 20, finalStepTotalTokens: 5 },
    };

    const buildService = (classifierEnabled = true) => {
        const updateModelResponse = vi.fn().mockResolvedValue(true);
        const enqueueThreadReconciliation = vi
            .fn()
            .mockResolvedValue(undefined);
        const instance = new AiAgentService({
            aiAgentModel: { updateModelResponse },
            mobilePushNotificationService: { enqueueThreadReconciliation },
            lightdashConfig: {
                ...lightdashConfigMock,
                ai: {
                    ...lightdashConfigMock.ai,
                    promptInputRequestClassifier: {
                        enabled: classifierEnabled,
                    },
                },
            },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

        return {
            service: instance as unknown as ServiceHarness,
            updateModelResponse: vi.mocked(updateModelResponse),
            enqueueThreadReconciliation,
        };
    };

    it('finalizes and classifies an untracked response after intermediate text', async () => {
        const { service, updateModelResponse } = buildService();
        const classifyPromptInputRequestAfterResponse = vi
            .spyOn(service, 'classifyPromptInputRequestAfterResponse')
            .mockImplementation(() => undefined);

        await service.persistTrackedPromptUpdate(
            {
                promptUuid: 'prompt-uuid',
                response: 'Intermediate response',
            },
            classificationContext,
        );
        await service.persistTrackedPromptUpdate(
            terminalUpdate,
            classificationContext,
        );

        expect(updateModelResponse).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ response: 'Intermediate response' }),
            { onlyIfPending: false },
        );
        expect(updateModelResponse).toHaveBeenNthCalledWith(2, terminalUpdate, {
            onlyIfUnfinalized: true,
        });
        expect(classifyPromptInputRequestAfterResponse).toHaveBeenCalledWith({
            ...classificationContext,
            promptUuid: 'prompt-uuid',
            response: 'Which project did you mean?',
        });
    });

    it('classifies only the first of two duplicate final updates', async () => {
        const { service, updateModelResponse } = buildService();
        updateModelResponse
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const classifyPromptInputRequestAfterResponse = vi
            .spyOn(service, 'classifyPromptInputRequestAfterResponse')
            .mockImplementation(() => undefined);

        await service.persistTrackedPromptUpdate(
            terminalUpdate,
            classificationContext,
        );
        await service.persistTrackedPromptUpdate(
            terminalUpdate,
            classificationContext,
        );

        expect(updateModelResponse).toHaveBeenCalledTimes(2);
        expect(updateModelResponse).toHaveBeenCalledWith(terminalUpdate, {
            onlyIfUnfinalized: true,
        });
        expect(classifyPromptInputRequestAfterResponse).toHaveBeenCalledTimes(
            1,
        );
    });

    it('does not classify a final update blocked by an existing error', async () => {
        const { service, updateModelResponse, enqueueThreadReconciliation } =
            buildService();
        updateModelResponse.mockResolvedValueOnce(false);
        const classifyPromptInputRequestAfterResponse = vi
            .spyOn(service, 'classifyPromptInputRequestAfterResponse')
            .mockImplementation(() => undefined);

        await service.persistTrackedPromptUpdate(
            terminalUpdate,
            classificationContext,
        );

        expect(updateModelResponse).toHaveBeenCalledWith(terminalUpdate, {
            onlyIfUnfinalized: true,
        });
        expect(classifyPromptInputRequestAfterResponse).not.toHaveBeenCalled();
        expect(enqueueThreadReconciliation).not.toHaveBeenCalled();
    });

    it('enqueues reconciliation after each persisted state update', async () => {
        const { service, enqueueThreadReconciliation } = buildService();
        vi.spyOn(
            service,
            'classifyPromptInputRequestAfterResponse',
        ).mockImplementation(() => undefined);

        await service.persistTrackedPromptUpdate(
            {
                promptUuid: 'prompt-uuid',
                response: 'Intermediate response',
            },
            classificationContext,
        );
        await service.persistTrackedPromptUpdate(
            terminalUpdate,
            classificationContext,
        );

        expect(enqueueThreadReconciliation).toHaveBeenCalledTimes(2);
        expect(enqueueThreadReconciliation).toHaveBeenCalledWith('thread-uuid');
    });

    it('keeps the pending guard for a terminal response when classification is disabled', async () => {
        const { service, updateModelResponse } = buildService(false);
        service.trackStreamPrompt('prompt-uuid', {
            respondedAt: null,
            response: null,
            errorMessage: null,
        });

        await service.persistTrackedPromptUpdate(
            terminalUpdate,
            classificationContext,
        );

        expect(updateModelResponse).toHaveBeenCalledWith(terminalUpdate, {
            onlyIfPending: true,
        });
    });
});
