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

const buildService = (aiMultiAgentRequireMention: boolean | undefined) => {
    const slackAuthenticationModel = {
        getOrganizationUuidFromTeamId: vi
            .fn()
            .mockResolvedValue(ORGANIZATION_UUID),
        getInstallationFromOrganizationUuid: vi.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            aiAgentsEnabled: true,
            aiMultiAgentChannelId: CHANNEL_ID,
            aiMultiAgentRequireMention,
        }),
    };
    const service = new AiAgentService({
        slackAuthenticationModel,
        analytics: { track: vi.fn() },
        lightdashConfig: { siteUrl: 'https://app.example.com', ai: {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Auth is the first step once a handler decides to respond, so it stands
    // in for "the router picked up the message".
    const handleAiAgentAuth = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(service as any, 'handleAiAgentAuth')
        .mockResolvedValue(undefined);

    return { service, handleAiAgentAuth };
};

const topLevelMessage = (text: string) => ({
    event: {
        user: SLACK_USER_ID,
        text,
        channel: CHANNEL_ID,
        channel_type: 'channel',
        ts: MESSAGE_TS,
    },
    context: { teamId: TEAM_ID, botUserId: 'BOT' },
    say: vi.fn(),
    client: {},
});

const appMention = {
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

describe('Multi-agent channel @mention requirement', () => {
    it.each([false, undefined])(
        'routes top-level messages without a mention when the setting is %s',
        async (setting) => {
            const { service, handleAiAgentAuth } = buildService(setting);

            await service.handleMultiAgentChannelMessage(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                topLevelMessage('what were sales last week?') as any,
            );

            expect(handleAiAgentAuth).toHaveBeenCalled();
        },
    );

    it('ignores top-level messages without a mention when the setting is on', async () => {
        const { service, handleAiAgentAuth } = buildService(true);

        await service.handleMultiAgentChannelMessage(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            topLevelMessage('just chatting with the team') as any,
        );

        expect(handleAiAgentAuth).not.toHaveBeenCalled();
    });

    it('still answers a top-level @mention when the setting is on', async () => {
        const { service, handleAiAgentAuth } = buildService(true);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await service.handleAppMention(appMention as any);

        expect(handleAiAgentAuth).toHaveBeenCalled();
    });
});
