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
const TEAM_ID = 'T12345';
const CHANNEL_ID = 'C12345';
const SLACK_USER_ID = 'U12345';
const MESSAGE_TS = '1700000000.000100';

const buildService = ({
    aiAgentsEnabled,
}: {
    aiAgentsEnabled: boolean | undefined;
}) => {
    const slackAuthenticationModel = {
        getOrganizationUuidFromTeamId: vi
            .fn()
            .mockResolvedValue(ORGANIZATION_UUID),
        getInstallationFromOrganizationUuid: vi.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            aiAgentsEnabled,
            aiMultiAgentChannelId: CHANNEL_ID,
        }),
    };
    const service = new AiAgentService({
        slackAuthenticationModel,
        analytics: { track: vi.fn() },
        lightdashConfig: { siteUrl: 'https://app.example.com', ai: {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Auth is the first thing both handlers do once the setting allows them
    // through, so it stands in for "an agent was invoked".
    const handleAiAgentAuth = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(service as any, 'handleAiAgentAuth')
        .mockResolvedValue(undefined);

    return { service, handleAiAgentAuth };
};

const appMentionArgs = {
    event: {
        user: SLACK_USER_ID,
        text: '<@BOT> what were sales last week?',
        channel: CHANNEL_ID,
        ts: MESSAGE_TS,
    },
    context: { teamId: TEAM_ID, botUserId: 'BOT' },
    say: vi.fn(),
    client: {},
};

const multiAgentMessageArgs = {
    event: {
        user: SLACK_USER_ID,
        text: 'what were sales last week?',
        channel: CHANNEL_ID,
        channel_type: 'channel',
        ts: MESSAGE_TS,
    },
    context: { teamId: TEAM_ID, botUserId: 'BOT' },
    say: vi.fn(),
    client: {},
};

describe('AI agents in Slack toggle', () => {
    it('does not invoke an agent on app mention when disabled', async () => {
        const { service, handleAiAgentAuth } = buildService({
            aiAgentsEnabled: false,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await service.handleAppMention(appMentionArgs as any);

        expect(handleAiAgentAuth).not.toHaveBeenCalled();
    });

    it('does not invoke an agent on a multi-agent channel message when disabled', async () => {
        const { service, handleAiAgentAuth } = buildService({
            aiAgentsEnabled: false,
        });

        await service.handleMultiAgentChannelMessage(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            multiAgentMessageArgs as any,
        );

        expect(handleAiAgentAuth).not.toHaveBeenCalled();
    });

    it('invokes an agent on app mention when enabled', async () => {
        const { service, handleAiAgentAuth } = buildService({
            aiAgentsEnabled: true,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await service.handleAppMention(appMentionArgs as any);

        expect(handleAiAgentAuth).toHaveBeenCalled();
    });

    it('invokes an agent on a multi-agent channel message when enabled', async () => {
        const { service, handleAiAgentAuth } = buildService({
            aiAgentsEnabled: true,
        });

        await service.handleMultiAgentChannelMessage(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            multiAgentMessageArgs as any,
        );

        expect(handleAiAgentAuth).toHaveBeenCalled();
    });

    it('invokes an agent when the setting is absent, so existing installations are unaffected', async () => {
        const { service, handleAiAgentAuth } = buildService({
            aiAgentsEnabled: undefined,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await service.handleAppMention(appMentionArgs as any);

        expect(handleAiAgentAuth).toHaveBeenCalled();
    });
});
