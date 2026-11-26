import {
    ForbiddenError,
    NotFoundError,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

const organizationUuid = 'organization-uuid';
const projectUuid = 'project-uuid';
const agentUuid = 'studio-agent-uuid';
const studioAgent = { uuid: agentUuid, projectUuid, organizationUuid };

const user: Pick<SessionUser, 'organizationUuid' | 'userUuid'> = {
    organizationUuid,
    userUuid: 'user-uuid',
};

const buildService = ({ studioEnabled }: { studioEnabled: boolean }) => {
    const aiAgentModel = {
        getAgent: vi.fn(async (_args: unknown) => studioAgent),
        isSemanticStudioAgent: vi.fn(async () => true),
        getOrCreateSemanticStudioAgent: vi.fn(async () => studioAgent),
        createWebAppThread: vi.fn(),
        deleteAgent: vi.fn(),
    };
    const service: AiAgentService = Object.assign(
        Object.create(AiAgentService.prototype),
        {
            aiAgentModel,
            semanticStudioService: {
                assertCanUseStudio: vi.fn(async () => {
                    if (!studioEnabled) throw new ForbiddenError();
                }),
            },
            getIsCopilotEnabled: vi.fn(async () => true),
            createAuditedAbility: () => ({ cannot: () => false }),
            checkAgentAccess: vi.fn(async () => true),
            getAgent: vi.fn(async () => studioAgent),
        },
    );
    return { service, aiAgentModel };
};

describe('built-in Semantic Studio agent', () => {
    it('refuses a thread that is not a Studio one', async () => {
        const { service, aiAgentModel } = buildService({ studioEnabled: true });

        await expect(
            service.createAgentThread(user as SessionUser, agentUuid, {
                prompt: 'How many orders last week?',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(aiAgentModel.createWebAppThread).not.toHaveBeenCalled();
    });

    it('is handed out only to someone who can use Studio on the project', async () => {
        const allowed = buildService({ studioEnabled: true });
        await expect(
            allowed.service.getSemanticStudioAgent(
                user as SessionUser,
                projectUuid,
            ),
        ).resolves.toBe(studioAgent);

        const refused = buildService({ studioEnabled: false });
        await expect(
            refused.service.getSemanticStudioAgent(
                user as SessionUser,
                projectUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(
            refused.aiAgentModel.getOrCreateSemanticStudioAgent,
        ).not.toHaveBeenCalled();
    });

    // The service's own lookup, without the stub the other tests stand on.
    const lookUp = (service: AiAgentService, includeBuiltIn: boolean) =>
        AiAgentService.prototype.getAgent.call(
            service,
            user as SessionUser,
            agentUuid,
            projectUuid,
            { includeBuiltIn },
        );

    it('does not exist for anything outside Studio that looks an agent up', async () => {
        const { service, aiAgentModel } = buildService({ studioEnabled: true });
        aiAgentModel.getAgent.mockRejectedValueOnce(
            new NotFoundError('AI agent not found'),
        );

        await expect(lookUp(service, false)).rejects.toThrow(NotFoundError);
        expect(aiAgentModel.getAgent).toHaveBeenCalledWith(
            expect.objectContaining({ agentKind: 'user' }),
        );
    });

    it('is found by the reads a chat screen makes', async () => {
        const { service, aiAgentModel } = buildService({ studioEnabled: true });

        await expect(lookUp(service, true)).resolves.toBe(studioAgent);
        expect(aiAgentModel.getAgent).toHaveBeenCalledWith(
            expect.not.objectContaining({ agentKind: 'user' }),
        );
    });
});
