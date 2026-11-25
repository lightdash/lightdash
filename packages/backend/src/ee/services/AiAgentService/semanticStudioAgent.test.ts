import { ForbiddenError, type SessionUser } from '@lightdash/common';
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
        getAgent: vi.fn(async () => studioAgent),
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
                getStatus: vi.fn(async () => ({ enabled: studioEnabled })),
            },
            getIsCopilotEnabled: vi.fn(async () => true),
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

    it('takes no appended instruction from someone who can manage agents', async () => {
        const { service } = buildService({ studioEnabled: true });
        Object.assign(service, {
            createAuditedAbility: () => ({ cannot: () => false }),
        });

        await expect(
            service.appendInstruction(
                user as SessionUser,
                projectUuid,
                agentUuid,
                'Always answer in French.',
            ),
        ).rejects.toThrow('The Semantic Studio agent cannot be changed');
    });

    it('cannot be deleted', async () => {
        const { service, aiAgentModel } = buildService({ studioEnabled: true });
        Object.assign(service, {
            createAuditedAbility: () => ({ cannot: () => false }),
        });

        await expect(
            service.deleteAgent(user as SessionUser, agentUuid),
        ).rejects.toThrow('The Semantic Studio agent cannot be changed');
        expect(aiAgentModel.deleteAgent).not.toHaveBeenCalled();
    });
});
