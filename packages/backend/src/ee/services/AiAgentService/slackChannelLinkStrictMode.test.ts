import {
    defineUserAbility,
    ForbiddenError,
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
}: {
    requireExplicitLinking: boolean;
}) => {
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue(agent),
        findAllAgents: vi.fn().mockResolvedValue([agent]),
        addSlackChannelIntegration: vi.fn().mockResolvedValue(undefined),
        findLastUsedProjectUuid: vi.fn().mockResolvedValue(null),
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

const buildPickerArgs = () => {
    const say = vi.fn().mockResolvedValue(undefined);
    const postEphemeral = vi.fn().mockResolvedValue(undefined);
    const client = { chat: { postEphemeral } };
    return {
        args: {
            organizationUuid: ORGANIZATION_UUID,
            userUuid: adminUser.userUuid,
            channelId: CHANNEL_ID,
            threadTs: THREAD_TS,
            say,
            client,
            slackUserId: SLACK_USER_ID,
        },
        say,
        postEphemeral,
    };
};

describe('linkAgentToSlackChannel strict mode', () => {
    it('refuses to link when the org requires explicit channel linking', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: true,
        });

        await expect(
            service.linkAgentToSlackChannel(adminUser, AGENT_UUID, CHANNEL_ID),
        ).rejects.toThrow(ForbiddenError);
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

describe('showChannelLinkAgentPicker strict mode', () => {
    it('posts an ephemeral pointing at agent settings and links nothing', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: true,
        });
        const { args, say, postEphemeral } = buildPickerArgs();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (service as any).showChannelLinkAgentPicker(args);

        expect(result).toBeUndefined();
        expect(postEphemeral).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: CHANNEL_ID,
                user: SLACK_USER_ID,
                thread_ts: THREAD_TS,
                text: expect.stringContaining(`${SITE_URL}/ai-agents`),
            }),
        );
        expect(aiAgentModel.addSlackChannelIntegration).not.toHaveBeenCalled();
        expect(aiAgentModel.findAllAgents).not.toHaveBeenCalled();
        expect(say).not.toHaveBeenCalled();
    });

    it('still auto-links the single manageable agent when strict mode is off', async () => {
        const { service, aiAgentModel } = buildService({
            requireExplicitLinking: false,
        });
        const { args, say, postEphemeral } = buildPickerArgs();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (service as any).showChannelLinkAgentPicker(args);

        expect(result?.uuid).toBe(AGENT_UUID);
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
});
