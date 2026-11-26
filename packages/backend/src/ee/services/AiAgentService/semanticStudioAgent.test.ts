import { NotFoundError } from '@lightdash/common';
import { defaultSessionUser as user } from '../../../auth/account/account.mock';
import { AiAgentService } from './AiAgentService';

const { organizationUuid } = user;
const projectUuid = 'project-uuid';
const agentUuid = 'studio-agent-uuid';

const buildService = () => {
    const aiAgentModel = {
        getAgent: vi.fn(async (_args: unknown) => ({
            uuid: agentUuid,
            projectUuid,
            organizationUuid,
        })),
        createWebAppThread: vi.fn(),
    };
    const service: AiAgentService = Object.assign(
        Object.create(AiAgentService.prototype),
        {
            aiAgentModel,
            getIsCopilotEnabled: vi.fn(async () => true),
            checkAgentAccess: vi.fn(async () => true),
        },
    );
    return { service, aiAgentModel };
};

describe('an agent that is not one people made', () => {
    it('is not asked for by an agent route, so the model leaves it out', async () => {
        const { service, aiAgentModel } = buildService();

        await service.getAgent(user, agentUuid, projectUuid);

        expect(aiAgentModel.getAgent).toHaveBeenCalledWith({
            organizationUuid,
            agentUuid,
            projectUuid,
        });
    });

    it('answers not found on an agent route, and starts no thread', async () => {
        const { service, aiAgentModel } = buildService();
        aiAgentModel.getAgent.mockRejectedValue(
            new NotFoundError('AI agent not found'),
        );

        await expect(
            service.getAgent(user, agentUuid, projectUuid),
        ).rejects.toThrow(NotFoundError);
        await expect(
            service.createAgentThread(user, agentUuid, {
                prompt: 'How many orders last week?',
            }),
        ).rejects.toThrow(NotFoundError);
        expect(aiAgentModel.createWebAppThread).not.toHaveBeenCalled();
    });

    it("is still found by a turn, which runs on its thread's agent", async () => {
        const { service, aiAgentModel } = buildService();

        await Reflect.get(AiAgentService.prototype, 'getAgentForPrompt').call(
            service,
            organizationUuid,
            { agentUuid },
        );

        expect(aiAgentModel.getAgent).toHaveBeenCalledWith({
            organizationUuid,
            agentUuid,
            agentKind: 'any',
        });
    });
});
