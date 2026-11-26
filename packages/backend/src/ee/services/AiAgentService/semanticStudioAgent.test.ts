import {
    ForbiddenError,
    NotFoundError,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

const organizationUuid = 'organization-uuid';
const projectUuid = 'project-uuid';
const agentUuid = 'studio-agent-uuid';
const studioAgent = {
    uuid: agentUuid,
    projectUuid,
    organizationUuid,
    kind: 'semantic_studio',
};

const user: Pick<SessionUser, 'organizationUuid' | 'userUuid'> = {
    organizationUuid,
    userUuid: 'user-uuid',
};

const AI_ON = {
    isCopilotEnabled: true,
    isTrial: false,
    aiAgentsVisible: true,
    hasModel: true,
};

const buildService = ({
    studioEnabled,
    ai = AI_ON,
}: {
    studioEnabled: boolean;
    ai?: typeof AI_ON;
}) => {
    const aiAgentModel = {
        getAgent: vi.fn(async (_args: unknown) => studioAgent),
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
                assertCanUseStudio: vi.fn(async () => {
                    if (!studioEnabled) throw new ForbiddenError();
                }),
            },
            getIsCopilotEnabled: vi.fn(async () => true),
            aiOrganizationSettingsService: {
                getRuntimeSettings: vi.fn(async () => ai),
            },
            orgAiCopilotConfigResolver: {
                getOrgModelCatalogue: vi.fn(async () => ({
                    catalogue: { instancePresets: [], offeredPresets: [] },
                    copilotConfig: {
                        defaultProvider: 'azure',
                        providers: {
                            azure: ai.hasModel
                                ? { deploymentName: 'model' }
                                : undefined,
                        },
                    },
                })),
            },
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

    it("follows Studio's permission, not Ask AI's", async () => {
        // Someone with no AI agent permission at all.
        const withoutAgentPermission = (studioEnabled: boolean) => {
            const { service } = buildService({ studioEnabled });
            Object.assign(service, {
                checkAgentAccess: Reflect.get(
                    AiAgentService.prototype,
                    'checkAgentAccess',
                ),
                createAuditedAbility: () => ({
                    can: () => false,
                    cannot: () => true,
                }),
            });
            return service;
        };

        await expect(lookUp(withoutAgentPermission(true), true)).resolves.toBe(
            studioAgent,
        );
        await expect(
            lookUp(withoutAgentPermission(false), true),
        ).rejects.toThrow(ForbiddenError);
    });

    it.each([
        ['the organization has no AI', { ...AI_ON, isCopilotEnabled: false }],
        ['an admin has hidden AI', { ...AI_ON, aiAgentsVisible: false }],
        ['no model is configured', { ...AI_ON, hasModel: false }],
    ])('is not handed out when %s', async (_, ai) => {
        const { service, aiAgentModel } = buildService({
            studioEnabled: true,
            ai,
        });

        await expect(
            service.getSemanticStudioAgent(user as SessionUser, projectUuid),
        ).rejects.toThrow(ForbiddenError);
        expect(
            aiAgentModel.getOrCreateSemanticStudioAgent,
        ).not.toHaveBeenCalled();
    });
});
