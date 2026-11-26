import {
    AiAgentNotFoundError,
    ForbiddenError,
    NotFoundError,
} from '@lightdash/common';
import { defaultSessionUser as user } from '../../../auth/account/account.mock';
import { AiAgentService } from './AiAgentService';

const { organizationUuid } = user;
const projectUuid = 'project-uuid';
const agentUuid = 'studio-agent-uuid';
const studioAgent = {
    uuid: agentUuid,
    projectUuid,
    organizationUuid,
    kind: 'semantic_studio',
};

const buildService = ({ studioEnabled }: { studioEnabled: boolean }) => {
    const aiAgentModel = {
        getAgent: vi.fn(async (_args: unknown) => studioAgent),
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
            createAuditedAbility: () => ({ cannot: () => false }),
            checkAgentAccess: vi.fn(async () => true),
            getAgent: vi.fn(async () => studioAgent),
        },
    );
    return { service, aiAgentModel };
};

describe('built-in Semantic Studio agent', () => {
    it('starts no thread through the agent route, whoever asks and whatever the thread', async () => {
        const { service, aiAgentModel } = buildService({ studioEnabled: true });

        await expect(
            service.createAgentThread(user, agentUuid, {
                prompt: 'How many orders last week?',
            }),
        ).rejects.toThrow(AiAgentNotFoundError);
        await expect(
            service.createAgentThread(user, agentUuid, {
                prompt: 'Add a metric',
                createdFrom: 'semantic_studio',
            }),
        ).rejects.toThrow(AiAgentNotFoundError);
        expect(aiAgentModel.createWebAppThread).not.toHaveBeenCalled();
    });

    it('does not let someone with only AI agent permission use it', async () => {
        // An interactive viewer: can view agents, cannot use Studio.
        const { service } = buildService({ studioEnabled: false });
        const checkAgentAccess = Reflect.get(
            AiAgentService.prototype,
            'checkAgentAccess',
        );
        const checkAgentThreadAccess = Reflect.get(
            AiAgentService.prototype,
            'checkAgentThreadAccess',
        );

        await expect(
            checkAgentAccess.call(service, user, studioAgent),
        ).resolves.toBe(false);
        await expect(
            checkAgentThreadAccess.call(
                service,
                user,
                studioAgent,
                user.userUuid,
            ),
        ).resolves.toBe(false);
    });

    // The service's own lookup, without the stub the other tests stand on.
    const lookUp = (service: AiAgentService, includeBuiltIn: boolean) =>
        AiAgentService.prototype.getAgent.call(
            service,
            user,
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
});

describe('a Semantic Studio thread on an ordinary agent', () => {
    const ordinaryAgent = {
        uuid: 'ordinary-agent-uuid',
        projectUuid,
        organizationUuid,
        kind: 'user',
    };
    const studioThread = {
        uuid: 'thread-uuid',
        agentUuid: ordinaryAgent.uuid,
        createdFrom: 'semantic_studio',
        user: { uuid: user.userUuid },
    };

    const buildOrdinary = () => {
        const aiAgentModel = {
            getAgent: vi.fn(async (_args: unknown) => ordinaryAgent),
            getThread: vi.fn(async (_args: unknown) => studioThread),
            createWebAppThread: vi.fn(),
            createWebAppPrompt: vi.fn(),
            getThreadMessages: vi.fn(),
        };
        const service: AiAgentService = Object.assign(
            Object.create(AiAgentService.prototype),
            {
                aiAgentModel,
                getIsCopilotEnabled: vi.fn(async () => true),
                checkAgentAccess: vi.fn(async () => true),
                checkAgentThreadAccess: vi.fn(async () => true),
                assertDataAppThreadContinuable: vi.fn(),
            },
        );
        return { service, aiAgentModel };
    };

    it('cannot be started through the agent route', async () => {
        const { service, aiAgentModel } = buildOrdinary();

        await expect(
            service.createAgentThread(user, ordinaryAgent.uuid, {
                prompt: 'Add a metric',
                createdFrom: 'semantic_studio',
            }),
        ).rejects.toThrow(AiAgentNotFoundError);
        expect(aiAgentModel.createWebAppThread).not.toHaveBeenCalled();
    });

    it('takes no message and runs no turn through the agent routes', async () => {
        const { service, aiAgentModel } = buildOrdinary();

        await expect(
            service.createAgentThreadMessage(
                user,
                ordinaryAgent.uuid,
                studioThread.uuid,
                { prompt: 'And revenue' },
            ),
        ).rejects.toThrow(AiAgentNotFoundError);
        // Stream, generate and the title all get their thread here.
        await expect(
            Reflect.get(
                AiAgentService.prototype,
                'authorizeThreadResponse',
            ).call(service, user, ordinaryAgent.uuid, studioThread.uuid),
        ).rejects.toThrow(AiAgentNotFoundError);
        expect(aiAgentModel.createWebAppPrompt).not.toHaveBeenCalled();
        expect(aiAgentModel.getThreadMessages).not.toHaveBeenCalled();
    });
});
