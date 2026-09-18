import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    type AiAgent,
    type AiAgentMessageAssistant,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class MockAiAgentMcpRuntimeClient {},
}));

const ORGANIZATION_UUID = 'organization-1';
const PROJECT_UUID = 'project-1';
const AGENT_UUID = 'agent-1';
const SPACE_UUID = 'space-1';
const THREAD_UUID = 'thread-1';
const MESSAGE_UUID = 'message-1';
const EMBED_ACTOR_UUID = 'embed-write-user-1';

const buildUser = ({
    userUuid = EMBED_ACTOR_UUID,
    canManageAgent = false,
}: {
    userUuid?: string;
    canManageAgent?: boolean;
} = {}): SessionUser =>
    ({
        userUuid,
        organizationUuid: ORGANIZATION_UUID,
        organizationName: 'Organization',
        ability: new Ability([
            { action: 'view', subject: 'Project' },
            ...(canManageAgent
                ? [{ action: 'manage', subject: 'AiAgent' }]
                : []),
        ]),
    }) as unknown as SessionUser;

const buildAgent = (overrides: Partial<AiAgent> = {}): AiAgent =>
    ({
        uuid: AGENT_UUID,
        name: 'Agent',
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        groupAccess: [],
        userAccess: [],
        spaceAccess: [SPACE_UUID],
        adminOnly: false,
        ...overrides,
    }) as AiAgent;

const buildEmbedAccount = ({
    projectUuid = PROJECT_UUID,
    tokenAgentUuid = AGENT_UUID,
    spaceUuid = SPACE_UUID,
    embedWriteUser = buildUser(),
    canUseAiAgent = true,
}: {
    projectUuid?: string;
    tokenAgentUuid?: string;
    spaceUuid?: string;
    embedWriteUser?: SessionUser;
    canUseAiAgent?: boolean;
} = {}): AnonymousAccount =>
    ({
        authentication: {
            type: 'jwt',
            data: {
                user: { externalId: 'external-embed-viewer' },
                content: { type: 'aiAgent', agentUuid: tokenAgentUuid },
                writeActions: { spaceUuid },
            },
        },
        user: {
            type: 'anonymous',
            externalId: 'external-embed-viewer',
        },
        embed: { projectUuid },
        embedWriteUser,
        embedWriteContext: { canUseAiAgent },
        access: { controls: { userAttributes: {} } },
    }) as unknown as AnonymousAccount;

type EmbedFeedbackOptions = {
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    humanScore: number;
    humanFeedback?: string | null;
};

type FindAssistantThreadMessage = (
    role: 'assistant',
    scope: {
        organizationUuid: string;
        threadUuid: string;
        messageUuid: string;
    },
) => Promise<AiAgentMessageAssistant>;

const buildService = ({
    agent = buildAgent(),
    threadOwnerUuid = EMBED_ACTOR_UUID,
    embedThreadSpaceUuid = SPACE_UUID,
    promptContext = {
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        agentUuid: AGENT_UUID,
        threadUuid: THREAD_UUID,
        promptUuid: MESSAGE_UUID,
    },
}: {
    agent?: AiAgent;
    threadOwnerUuid?: string;
    embedThreadSpaceUuid?: string | undefined;
    promptContext?: Awaited<
        ReturnType<AiAgentModel['findPromptContext']>
    > | null;
} = {}) => {
    const aiAgentModel = {
        getWebAppThreadEmbedSpace: vi.fn<
            AiAgentModel['getWebAppThreadEmbedSpace']
        >(async () => embedThreadSpaceUuid),
        findPromptContext: vi.fn<AiAgentModel['findPromptContext']>(
            async () => promptContext ?? undefined,
        ),
        getThread: vi.fn<AiAgentModel['getThread']>(
            async () =>
                ({
                    user: { uuid: threadOwnerUuid },
                }) as Awaited<ReturnType<AiAgentModel['getThread']>>,
        ),
        findThreadMessage: vi.fn<FindAssistantThreadMessage>(
            async () =>
                ({
                    uuid: MESSAGE_UUID,
                }) as AiAgentMessageAssistant,
        ),
        updateHumanScore: vi.fn<AiAgentModel['updateHumanScore']>(),
    };
    const analytics = { track: vi.fn() };
    const aiAgentReviewClassifier =
        vi.fn<CommercialSchedulerClient['aiAgentReviewClassifier']>();
    const aiAgentMemoryDistill =
        vi.fn<CommercialSchedulerClient['aiAgentMemoryDistill']>();
    const getFeatureFlag = vi.fn<FeatureFlagService['get']>(async () => ({
        id: 'ai-copilot',
        enabled: true,
    }));
    const service = new AiAgentService({
        aiAgentModel,
        analytics,
        featureFlagService: { get: getFeatureFlag },
        schedulerClient: {
            aiAgentReviewClassifier,
            aiAgentMemoryDistill,
        },
        aiOrganizationSettingsService: {
            isAiAgentReviewsEnabled: vi.fn(async () => true),
            isAiAgentMemoryEnabled: vi.fn(async () => true),
        },
        groupsModel: { findUserInGroups: vi.fn(async () => []) },
        lightdashConfig: { ai: { copilot: {} } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(service, 'getAgent').mockResolvedValue(agent);

    const updateEmbedFeedback = (
        account: AnonymousAccount,
        projectUuid = PROJECT_UUID,
        options: Partial<EmbedFeedbackOptions> = {},
    ) =>
        service.updateEmbedHumanScoreForMessage(account, projectUuid, {
            agentUuid: AGENT_UUID,
            threadUuid: THREAD_UUID,
            messageUuid: MESSAGE_UUID,
            humanScore: -1,
            humanFeedback: 'Incorrect result',
            ...options,
        });

    return {
        service,
        aiAgentModel,
        analytics,
        aiAgentReviewClassifier,
        aiAgentMemoryDistill,
        updateEmbedFeedback,
    };
};

describe('AiAgentService updateEmbedHumanScoreForMessage', () => {
    it('writes feedback as the token-configured actor and preserves side effects', async () => {
        const {
            aiAgentModel,
            analytics,
            aiAgentReviewClassifier,
            aiAgentMemoryDistill,
            updateEmbedFeedback,
        } = buildService();

        await updateEmbedFeedback(buildEmbedAccount());

        expect(aiAgentModel.updateHumanScore).toHaveBeenCalledWith({
            promptUuid: MESSAGE_UUID,
            humanScore: -1,
            humanFeedback: 'Incorrect result',
        });
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({ userId: EMBED_ACTOR_UUID }),
        );
        await vi.waitFor(() => {
            expect(aiAgentReviewClassifier).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: EMBED_ACTOR_UUID }),
            );
            expect(aiAgentMemoryDistill).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: EMBED_ACTOR_UUID }),
                expect.any(Date),
            );
        });
    });

    it('allows the token-configured actor with manage access to update another actor thread', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService({
            threadOwnerUuid: 'another-user',
        });
        const account = buildEmbedAccount({
            embedWriteUser: buildUser({ canManageAgent: true }),
        });

        await expect(updateEmbedFeedback(account)).resolves.toBeUndefined();
        expect(aiAgentModel.updateHumanScore).toHaveBeenCalledOnce();
    });

    it('rejects a valid token used for another project', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService();

        await expect(
            updateEmbedFeedback(buildEmbedAccount(), 'project-2'),
        ).rejects.toThrow(ForbiddenError);
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });

    it('rejects a valid token used for another agent', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService();

        await expect(
            updateEmbedFeedback(buildEmbedAccount(), PROJECT_UUID, {
                agentUuid: 'agent-2',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });

    it('rejects a token without AI agent write context', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService();

        await expect(
            updateEmbedFeedback(buildEmbedAccount({ canUseAiAgent: false })),
        ).rejects.toThrow(ForbiddenError);
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });

    it('rejects an agent unavailable in the embedded space', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService({
            agent: buildAgent({ spaceAccess: ['space-2'] }),
        });

        await expect(updateEmbedFeedback(buildEmbedAccount())).rejects.toThrow(
            ForbiddenError,
        );
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });

    it('rejects a thread outside the embedded space', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService({
            embedThreadSpaceUuid: 'space-2',
        });

        await expect(updateEmbedFeedback(buildEmbedAccount())).rejects.toThrow(
            ForbiddenError,
        );
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });

    it.each([
        ['organization', { organizationUuid: 'organization-2' }],
        ['project', { projectUuid: 'project-2' }],
        ['agent', { agentUuid: 'agent-2' }],
        ['thread', { threadUuid: 'thread-2' }],
    ])('rejects a prompt from another %s', async (_scope, override) => {
        const { aiAgentModel, updateEmbedFeedback } = buildService({
            promptContext: {
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                agentUuid: AGENT_UUID,
                threadUuid: THREAD_UUID,
                promptUuid: MESSAGE_UUID,
                ...override,
            },
        });

        await expect(updateEmbedFeedback(buildEmbedAccount())).rejects.toThrow(
            ForbiddenError,
        );
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });

    it('rejects an unknown prompt', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService({
            promptContext: null,
        });

        await expect(updateEmbedFeedback(buildEmbedAccount())).rejects.toThrow(
            ForbiddenError,
        );
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });

    it('rejects another actor thread without manage access', async () => {
        const { aiAgentModel, updateEmbedFeedback } = buildService({
            threadOwnerUuid: 'another-user',
        });

        await expect(updateEmbedFeedback(buildEmbedAccount())).rejects.toThrow(
            ForbiddenError,
        );
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
    });
});
