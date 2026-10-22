import { Ability } from '@casl/ability';
import {
    type AiAgent,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class MockAiAgentMcpRuntimeClient {},
}));

const ORGANIZATION_UUID = 'organization-1';
const PROJECT_UUID = 'project-1';
const AGENT_UUID = 'agent-1';
const WRITE_SPACE_UUID = 'write-space-1';
const SOURCE_SPACE_UUID = 'source-space-1';
const OTHER_SOURCE_SPACE_UUID = 'source-space-2';
const SECOND_WRITE_SPACE_UUID = 'write-space-2';
const THREAD_UUID = 'thread-1';
const EMBED_ACTOR_UUID = 'embed-write-user-1';

const user = {
    userUuid: EMBED_ACTOR_UUID,
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'Organization',
    ability: new Ability([
        { action: 'view', subject: 'Project' },
        { action: 'view', subject: 'AiAgent' },
    ]),
} as unknown as SessionUser;

const buildAgent = (spaceAccess: string[]) =>
    ({
        uuid: AGENT_UUID,
        name: 'Agent',
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        groupAccess: [],
        userAccess: [],
        spaceAccess,
        adminOnly: false,
    }) as unknown as AiAgent;

type WriteActions = {
    spaceUuid?: string;
    writeSpaceUuids?: string[];
    sourceSpaceUuids?: string[];
};

const buildEmbedAccount = (writeActions: WriteActions): AnonymousAccount =>
    ({
        isJwtUser: () => true,
        authentication: {
            type: 'jwt',
            data: {
                content: { type: 'aiAgent', agentUuid: AGENT_UUID },
                writeActions,
            },
        },
        user: { type: 'anonymous' },
        embed: { projectUuid: PROJECT_UUID },
        embedWriteUser: user,
        embedWriteContext: { canUseAiAgent: true },
        access: { controls: { userAttributes: {} } },
    }) as unknown as AnonymousAccount;

const buildService = (agent: AiAgent) => {
    const aiAgentModel = {
        getAgent: vi.fn(async () => agent),
        getThread: vi.fn(async () => ({
            uuid: THREAD_UUID,
            createdFrom: 'web_app',
            user: { uuid: EMBED_ACTOR_UUID },
        })),
        isWebAppThreadInEmbedSpaces: vi.fn(
            async (_: string, spaces: string[]) =>
                spaces.includes(WRITE_SPACE_UUID),
        ),
        createWebAppPrompt: vi.fn(async () => 'prompt-1'),
        findThreadMessage: vi.fn(async () => ({ uuid: 'prompt-1' })),
        findThreadModelConfig: vi.fn(async () => null),
        findThreads: vi.fn(async () => []),
    };
    const service = new AiAgentService({
        aiAgentModel,
        analytics: { track: vi.fn() },
        featureFlagService: {
            get: vi.fn(async () => ({ id: 'ai-copilot', enabled: true })),
        },
        groupsModel: { findUserInGroups: vi.fn(async () => []) },
        aiOrganizationSettingsService: {
            getDefaultModelConfig: vi.fn(async () => null),
        },
        lightdashConfig: { ai: { copilot: {} } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

    const internals = service as unknown as Record<
        | 'getIsCopilotEnabled'
        | 'assertDataAppThreadContinuable'
        | 'checkAgentThreadAccess'
        | 'validatePromptContextAccess'
        | 'persistSkillInvocation'
        | 'enqueueMobilePushThreadReconciliation'
        | 'startMobilePushLiveActivitiesForPrompt',
        (...args: unknown[]) => unknown
    >;
    vi.spyOn(service, 'getAgent').mockResolvedValue(agent);
    vi.spyOn(internals, 'getIsCopilotEnabled').mockResolvedValue(true);
    vi.spyOn(internals, 'assertDataAppThreadContinuable').mockResolvedValue(
        undefined,
    );
    vi.spyOn(internals, 'checkAgentThreadAccess').mockResolvedValue(true);
    const validatePromptContextAccess = vi
        .spyOn(internals, 'validatePromptContextAccess')
        .mockResolvedValue(undefined);
    vi.spyOn(internals, 'persistSkillInvocation').mockResolvedValue(undefined);
    vi.spyOn(
        internals,
        'enqueueMobilePushThreadReconciliation',
    ).mockReturnValue(undefined);
    vi.spyOn(
        internals,
        'startMobilePushLiveActivitiesForPrompt',
    ).mockResolvedValue(undefined);

    return { service, validatePromptContextAccess, aiAgentModel };
};

const getAllowedSpaces = async (agent: AiAgent, writeActions: WriteActions) => {
    const { service, validatePromptContextAccess } = buildService(agent);
    await service.createEmbedAgentThreadMessage(
        buildEmbedAccount(writeActions),
        PROJECT_UUID,
        AGENT_UUID,
        THREAD_UUID,
        { prompt: 'How many orders last week?' },
    );
    return validatePromptContextAccess.mock.calls[0][3];
};

describe('embedded agent source spaces', () => {
    it('scopes the agent to the write space without source spaces', async () => {
        await expect(
            getAllowedSpaces(buildAgent([]), { spaceUuid: WRITE_SPACE_UUID }),
        ).resolves.toEqual([WRITE_SPACE_UUID]);
    });

    it('adds the token source spaces to the agent scope', async () => {
        await expect(
            getAllowedSpaces(buildAgent([]), {
                spaceUuid: WRITE_SPACE_UUID,
                sourceSpaceUuids: [SOURCE_SPACE_UUID],
            }),
        ).resolves.toEqual([WRITE_SPACE_UUID, SOURCE_SPACE_UUID]);
    });

    it('combines every write space with the source spaces', async () => {
        await expect(
            getAllowedSpaces(buildAgent([]), {
                writeSpaceUuids: [WRITE_SPACE_UUID, SECOND_WRITE_SPACE_UUID],
                sourceSpaceUuids: [SOURCE_SPACE_UUID, WRITE_SPACE_UUID],
            }),
        ).resolves.toEqual([
            WRITE_SPACE_UUID,
            SECOND_WRITE_SPACE_UUID,
            SOURCE_SPACE_UUID,
        ]);
    });

    it('keeps source spaces read-only unless they are also write spaces', async () => {
        const { service } = buildService(buildAgent([]));
        const internals = service as unknown as {
            getEmbedAgent: (
                account: AnonymousAccount,
                projectUuid: string,
                agentUuid: string,
            ) => Promise<{ runtimeOptions: { readOnlySpaceUuids: string[] } }>;
        };

        const { runtimeOptions } = await internals.getEmbedAgent(
            buildEmbedAccount({
                writeSpaceUuids: [WRITE_SPACE_UUID, SECOND_WRITE_SPACE_UUID],
                sourceSpaceUuids: [SOURCE_SPACE_UUID, SECOND_WRITE_SPACE_UUID],
            }),
            PROJECT_UUID,
            AGENT_UUID,
        );

        expect(runtimeOptions.readOnlySpaceUuids).toEqual([SOURCE_SPACE_UUID]);
    });

    it('drops spaces a space-restricted agent cannot access', async () => {
        await expect(
            getAllowedSpaces(
                buildAgent([WRITE_SPACE_UUID, SOURCE_SPACE_UUID]),
                {
                    writeSpaceUuids: [
                        WRITE_SPACE_UUID,
                        SECOND_WRITE_SPACE_UUID,
                    ],
                    sourceSpaceUuids: [
                        SOURCE_SPACE_UUID,
                        OTHER_SOURCE_SPACE_UUID,
                    ],
                },
            ),
        ).resolves.toEqual([WRITE_SPACE_UUID, SOURCE_SPACE_UUID]);
    });
});

describe('embedded agent thread spaces', () => {
    const writeActions = {
        writeSpaceUuids: [WRITE_SPACE_UUID, SECOND_WRITE_SPACE_UUID],
    };

    it('lists threads that belong to every token write space', async () => {
        const { service, aiAgentModel } = buildService(buildAgent([]));
        await service.listEmbedAgentThreads(
            buildEmbedAccount(writeActions),
            PROJECT_UUID,
            AGENT_UUID,
        );
        expect(aiAgentModel.findThreads).toHaveBeenCalledWith(
            expect.objectContaining({
                embedWriteSpaceUuids: [
                    WRITE_SPACE_UUID,
                    SECOND_WRITE_SPACE_UUID,
                ],
            }),
        );
    });

    it('checks a thread against every token write space', async () => {
        const { service, aiAgentModel } = buildService(buildAgent([]));
        await service.createEmbedAgentThreadMessage(
            buildEmbedAccount(writeActions),
            PROJECT_UUID,
            AGENT_UUID,
            THREAD_UUID,
            { prompt: 'How many orders last week?' },
        );
        expect(aiAgentModel.isWebAppThreadInEmbedSpaces).toHaveBeenCalledWith(
            THREAD_UUID,
            [WRITE_SPACE_UUID, SECOND_WRITE_SPACE_UUID],
        );
    });

    it('allows an agent limited to a later write space', async () => {
        const { service } = buildService(buildAgent([SECOND_WRITE_SPACE_UUID]));
        await expect(
            service.getEmbedAgentDetails(
                buildEmbedAccount(writeActions),
                PROJECT_UUID,
                AGENT_UUID,
            ),
        ).resolves.toMatchObject({ uuid: AGENT_UUID });
    });

    it('refuses an agent limited to none of the write spaces', async () => {
        const { service } = buildService(buildAgent([SOURCE_SPACE_UUID]));
        await expect(
            service.getEmbedAgentDetails(
                buildEmbedAccount(writeActions),
                PROJECT_UUID,
                AGENT_UUID,
            ),
        ).rejects.toThrow('AI agent is not available in the embedded space');
    });
});
