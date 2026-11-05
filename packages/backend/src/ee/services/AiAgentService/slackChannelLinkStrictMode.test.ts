import {
    defineUserAbility,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const ORGANIZATION_UUID = 'org-uuid';
const PROJECT_UUID = 'project-uuid';
const AGENT_UUID = 'agent-uuid';
const CHANNEL_ID = 'C12345';
const SLACK_USER_ID = 'U12345';
const THREAD_TS = '1700000000.000100';
const MESSAGE_TS = '1700000000.000200';
const SITE_URL = 'https://app.example.com';

const adminUser: SessionUser = {
    userUuid: 'user-admin',
    organizationUuid: ORGANIZATION_UUID,
    role: OrganizationMemberRole.ADMIN,
    ability: defineUserAbility(
        {
            organizationUuid: ORGANIZATION_UUID,
            userUuid: 'user-admin',
            role: OrganizationMemberRole.ADMIN,
        },
        [],
    ),
} as unknown as SessionUser;

const agent = {
    uuid: AGENT_UUID,
    name: 'Sensitive Agent',
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    adminOnly: false,
    integrations: [],
    groupAccess: [],
    userAccess: [],
};

const buildService = ({
    requireExplicitLinking,
    agents = [agent],
}: {
    requireExplicitLinking: boolean;
    agents?: (typeof agent)[];
}) => {
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue(agent),
        findAllAgents: vi.fn().mockResolvedValue(agents),
        addSlackChannelIntegration: vi.fn().mockResolvedValue(undefined),
        findLastUsedProjectUuid: vi.fn().mockResolvedValue(null),
        filterExistingProjectUuids: vi.fn().mockResolvedValue([]),
        createAgent: vi.fn(),
    };
    const service = new AiAgentService({
        aiAgentModel,
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(adminUser),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({ name: 'Jaffle Shop' }),
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        aiOrganizationSettingsService: {
            isExplicitSlackChannelLinkingRequired: vi
                .fn()
                .mockResolvedValue(requireExplicitLinking),
        },
        analytics: { track: vi.fn() },
        lightdashConfig: { siteUrl: SITE_URL, ai: { copilot: {} } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { service, aiAgentModel };
};

const buildUnmappedChannelArgs = ({ threadTs }: { threadTs?: string } = {}) => {
    const say = vi.fn().mockResolvedValue(undefined);
    const postEphemeral = vi.fn().mockResolvedValue(undefined);
    const client = { chat: { postEphemeral } };
    return {
        args: {
            organizationUuid: ORGANIZATION_UUID,
            userUuid: adminUser.userUuid,
            channelId: CHANNEL_ID,
            messageTs: MESSAGE_TS,
            threadTs,
            say,
            client,
            slackUserId: SLACK_USER_ID,
            visibleProjectUuids: undefined,
        },
        say,
        postEphemeral,
    };
};

type UnmappedChannelArgs = ReturnType<typeof buildUnmappedChannelArgs>['args'];

const resolveUnmappedChannel = (
    service: AiAgentService,
    args: UnmappedChannelArgs,
) =>
    (
        service as unknown as {
            resolveAgentForUnmappedSlackChannel: (
                a: UnmappedChannelArgs,
            ) => Promise<{ uuid: string } | 'handled'>;
        }
    ).resolveAgentForUnmappedSlackChannel(args);

describe('linkAgentToSlackChannel strict mode', () => {
    it('refuses to link when the org requires explicit channel linking', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: true,
        });

        await expect(
            service.linkAgentToSlackChannel(adminUser, AGENT_UUID, CHANNEL_ID),
        ).rejects.toMatchObject({
            message: expect.stringContaining(
                'requires channels to be added from the agent settings page',
            ),
            data: { reason: 'explicit_slack_channel_linking_required' },
        });
        expect(aiAgentModel.addSlackChannelIntegration).not.toHaveBeenCalled();
    });

    it('links the channel when the org does not require explicit linking', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: false,
        });

        const linked = await service.linkAgentToSlackChannel(
            adminUser,
            AGENT_UUID,
            CHANNEL_ID,
        );

        expect(linked.uuid).toBe(AGENT_UUID);
        expect(aiAgentModel.addSlackChannelIntegration).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            agentUuid: AGENT_UUID,
            slackChannelId: CHANNEL_ID,
        });
    });
});

describe('resolveAgentForUnmappedSlackChannel', () => {
    it('posts an ephemeral and never creates an agent when strict mode is on', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: true,
        });
        const { args, say, postEphemeral } = buildUnmappedChannelArgs({
            threadTs: THREAD_TS,
        });

        const result = await resolveUnmappedChannel(service, args);

        expect(result).toBe('handled');
        expect(postEphemeral).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: CHANNEL_ID,
                user: SLACK_USER_ID,
                thread_ts: THREAD_TS,
                text: expect.stringContaining(`${SITE_URL}/ai-agents`),
            }),
        );
        expect(aiAgentModel.createAgent).not.toHaveBeenCalled();
        expect(aiAgentModel.addSlackChannelIntegration).not.toHaveBeenCalled();
        expect(aiAgentModel.findAllAgents).not.toHaveBeenCalled();
        expect(say).not.toHaveBeenCalled();
    });

    it('posts the ephemeral without thread_ts for a top-level mention', async () => {
        // Slack drops ephemeral thread replies when the thread is not active
        // yet, so a first mention must get a channel-level ephemeral.
        const { service } = buildService({ requireExplicitLinking: true });
        const { args, postEphemeral } = buildUnmappedChannelArgs();

        const result = await resolveUnmappedChannel(service, args);

        expect(result).toBe('handled');
        expect(postEphemeral).toHaveBeenCalledTimes(1);
        expect(postEphemeral.mock.calls[0][0]).not.toHaveProperty('thread_ts');
        expect(postEphemeral.mock.calls[0][0]).toMatchObject({
            channel: CHANNEL_ID,
            user: SLACK_USER_ID,
        });
    });

    it('auto-links the single manageable agent when strict mode is off', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: false,
        });
        const { args, say, postEphemeral } = buildUnmappedChannelArgs();

        const result = await resolveUnmappedChannel(service, args);

        expect(result).toMatchObject({ uuid: AGENT_UUID });
        expect(aiAgentModel.addSlackChannelIntegration).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            agentUuid: AGENT_UUID,
            slackChannelId: CHANNEL_ID,
        });
        expect(postEphemeral).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining('Linked'),
            }),
        );
    });

    it('points at the agents page instead of creating an agent when the org has none', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: false,
            agents: [],
        });
        const { args, say, postEphemeral } = buildUnmappedChannelArgs({
            threadTs: THREAD_TS,
        });

        const result = await resolveUnmappedChannel(service, args);

        expect(result).toBe('handled');
        expect(say).toHaveBeenCalledTimes(1);
        expect(say).toHaveBeenCalledWith({
            text: expect.stringContaining(`${SITE_URL}/ai-agents`),
            thread_ts: THREAD_TS,
        });
        expect(aiAgentModel.createAgent).not.toHaveBeenCalled();
        expect(aiAgentModel.addSlackChannelIntegration).not.toHaveBeenCalled();
        expect(postEphemeral).not.toHaveBeenCalled();
    });
});

describe('selectAgentForSlack without configured agents', () => {
    it('tells the user no agents are available and creates none', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: false,
            agents: [],
        });
        const say = vi.fn().mockResolvedValue(undefined);
        const postMessage = vi.fn().mockResolvedValue(undefined);

        const result = await (
            service as unknown as {
                selectAgentForSlack: (args: {
                    availableAgents: never[];
                    messageText: string;
                    channelId: string;
                    threadTs: string | undefined;
                    promptSlackTs: string;
                    say: typeof say;
                    botUserId: string | undefined;
                    client: { chat: { postMessage: typeof postMessage } };
                    isMultiAgentChannel: boolean;
                    organizationUuid: string;
                    userUuid: string;
                }) => Promise<unknown>;
            }
        ).selectAgentForSlack({
            availableAgents: [],
            messageText: 'how many orders did we get last week?',
            channelId: CHANNEL_ID,
            threadTs: THREAD_TS,
            promptSlackTs: MESSAGE_TS,
            say,
            botUserId: 'B12345',
            client: { chat: { postMessage } },
            isMultiAgentChannel: true,
            organizationUuid: ORGANIZATION_UUID,
            userUuid: adminUser.userUuid,
        });

        expect(result).toBeUndefined();
        expect(say).toHaveBeenCalledTimes(1);
        expect(say).toHaveBeenCalledWith({
            text: expect.stringContaining('No AI agents are available'),
            thread_ts: THREAD_TS,
        });
        expect(aiAgentModel.createAgent).not.toHaveBeenCalled();
        expect(postMessage).not.toHaveBeenCalled();
    });
});
