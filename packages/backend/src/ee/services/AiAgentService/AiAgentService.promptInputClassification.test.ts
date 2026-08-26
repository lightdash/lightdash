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

    it('finalizes and classifies an untracked response after intermediate text', async () => {
        const updateModelResponse = vi.fn().mockResolvedValue(true);
        const instance = new AiAgentService({
            aiAgentModel: { updateModelResponse },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        const service = instance as unknown as ServiceHarness;
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
        const updateModelResponse = vi
            .fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const instance = new AiAgentService({
            aiAgentModel: { updateModelResponse },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        const service = instance as unknown as ServiceHarness;
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
        const updateModelResponse = vi.fn().mockResolvedValue(false);
        const instance = new AiAgentService({
            aiAgentModel: { updateModelResponse },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        const service = instance as unknown as ServiceHarness;
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
    });
});
