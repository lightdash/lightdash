import { Ability } from '@casl/ability';
import {
    type AiAgent,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class MockAiAgentMcpRuntimeClient {},
}));

const ORGANIZATION_UUID = 'organization-1';
const PROJECT_UUID = 'project-1';
const AGENT_UUID = 'agent-1';
const SPACE_UUID = 'space-1';
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

const agent = {
    uuid: AGENT_UUID,
    name: 'Agent',
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    groupAccess: [],
    userAccess: [],
    spaceAccess: [SPACE_UUID],
    adminOnly: false,
} as unknown as AiAgent;

const buildEmbedAccount = (
    tokenUser: { externalId?: string | null } | undefined,
): AnonymousAccount =>
    ({
        authentication: {
            type: 'jwt',
            data: {
                user: tokenUser,
                content: { type: 'aiAgent', agentUuid: AGENT_UUID },
                writeActions: { spaceUuid: SPACE_UUID },
            },
        },
        user: { type: 'anonymous' },
        embed: { projectUuid: PROJECT_UUID },
        embedWriteUser: user,
        embedWriteContext: { canUseAiAgent: true },
        access: { controls: { userAttributes: {} } },
    }) as unknown as AnonymousAccount;

const buildService = () => {
    const aiAgentModel = {
        getAgent: vi.fn(async () => agent),
        getThread: vi.fn(async () => ({
            uuid: THREAD_UUID,
            createdFrom: 'web_app',
            user: { uuid: EMBED_ACTOR_UUID },
        })),
        getWebAppThreadEmbedSpace: vi.fn(async () => SPACE_UUID),
        createWebAppPrompt: vi.fn<AiAgentModel['createWebAppPrompt']>(
            async () => 'prompt-1',
        ),
        findThreadMessage: vi.fn(async () => ({ uuid: 'prompt-1' })),
    };
    const service = new AiAgentService({
        aiAgentModel,
        analytics: { track: vi.fn() },
        featureFlagService: {
            get: vi.fn(async () => ({ id: 'ai-copilot', enabled: true })),
        },
        groupsModel: { findUserInGroups: vi.fn(async () => []) },
        lightdashConfig: { ai: { copilot: {} } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

    // The turn's side effects are not what decides who the viewer is.
    const internals = service as unknown as Record<
        | 'getIsCopilotEnabled'
        | 'assertDataAppThreadContinuable'
        | 'checkAgentThreadAccess'
        | 'validatePromptContextAccess'
        | 'persistSkillInvocation'
        | 'enqueueMobilePushThreadReconciliation'
        | 'startMobilePushLiveActivitiesForPrompt',
        () => unknown
    >;
    vi.spyOn(service, 'getAgent').mockResolvedValue(agent);
    vi.spyOn(internals, 'getIsCopilotEnabled').mockResolvedValue(true);
    vi.spyOn(internals, 'assertDataAppThreadContinuable').mockResolvedValue(
        undefined,
    );
    vi.spyOn(internals, 'checkAgentThreadAccess').mockResolvedValue(true);
    vi.spyOn(internals, 'validatePromptContextAccess').mockResolvedValue(
        undefined,
    );
    vi.spyOn(internals, 'persistSkillInvocation').mockResolvedValue(undefined);
    vi.spyOn(
        internals,
        'enqueueMobilePushThreadReconciliation',
    ).mockReturnValue(undefined);
    vi.spyOn(
        internals,
        'startMobilePushLiveActivitiesForPrompt',
    ).mockResolvedValue(undefined);

    return { service, aiAgentModel };
};

describe('embedded agent viewer attribution', () => {
    it('records which viewer sent each message of an embedded chat', async () => {
        const { service, aiAgentModel } = buildService();

        await service.createEmbedAgentThreadMessage(
            buildEmbedAccount({ externalId: 'viewer-1' }),
            PROJECT_UUID,
            AGENT_UUID,
            THREAD_UUID,
            { prompt: 'How many orders last week?' },
        );
        await service.createEmbedAgentThreadMessage(
            buildEmbedAccount({ externalId: 'viewer-2' }),
            PROJECT_UUID,
            AGENT_UUID,
            THREAD_UUID,
            { prompt: 'And the week before?' },
        );

        expect(
            aiAgentModel.createWebAppPrompt.mock.calls.map(
                ([prompt]) => prompt.externalUserId,
            ),
        ).toEqual(['viewer-1', 'viewer-2']);
    });

    it('records no viewer when the host application did not name one', async () => {
        const { service, aiAgentModel } = buildService();

        await service.createEmbedAgentThreadMessage(
            buildEmbedAccount(undefined),
            PROJECT_UUID,
            AGENT_UUID,
            THREAD_UUID,
            { prompt: 'How many orders last week?' },
        );

        expect(
            aiAgentModel.createWebAppPrompt.mock.calls[0][0].externalUserId,
        ).toBeNull();
    });

    it('records no viewer for a message sent from the app', async () => {
        const { service, aiAgentModel } = buildService();

        await service.createAgentThreadMessage(user, AGENT_UUID, THREAD_UUID, {
            prompt: 'How many orders last week?',
        });

        expect(
            aiAgentModel.createWebAppPrompt.mock.calls[0][0].externalUserId,
        ).toBeNull();
    });
});
