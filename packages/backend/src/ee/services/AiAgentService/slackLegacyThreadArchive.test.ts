import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const THREAD_TS = '1700000000.000100';
const CHANNEL_ID = 'C123';

const buildService = () => {
    const claimLegacySlackArchivedNotice = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false);
    const createSlackPrompt = vi.fn();
    const service = new AiAgentService({
        slackAuthenticationModel: {
            getOrganizationUuidFromTeamId: vi
                .fn()
                .mockResolvedValue('org-uuid'),
            getInstallationFromOrganizationUuid: vi.fn().mockResolvedValue({
                aiRequireOAuth: false,
                aiMultiAgentChannelId: null,
                aiThreadAccessConsent: false,
            }),
        },
        aiAgentModel: {
            getAgentBySlackChannelId: vi.fn().mockResolvedValue({
                uuid: 'agent-uuid',
                name: 'Agent',
                organizationUuid: 'org-uuid',
                projectUuid: 'project-uuid',
            }),
            findThreadUuidBySlackChannelIdAndThreadTs: vi
                .fn()
                .mockResolvedValue('legacy-thread-uuid'),
            claimLegacySlackArchivedNotice,
            releaseLegacySlackArchivedNotice: vi.fn(),
        },
        userModel: {
            getUserDetailsByUuid: vi.fn().mockResolvedValue({
                userUuid: 'user-uuid',
                organizationUuid: 'org-uuid',
            }),
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        aiAgentThreadRepository: {
            getStorageVersion: vi.fn().mockResolvedValue(1),
        },
        lightdashConfig: {
            siteUrl: 'https://example.com',
            ai: { copilot: {} },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    Object.assign(service, {
        createSlackPrompt,
        handleAiAgentAuth: vi.fn().mockResolvedValue({ userUuid: 'user-uuid' }),
        verifyAgentAccess: vi.fn().mockResolvedValue(undefined),
    });
    return { claimLegacySlackArchivedNotice, createSlackPrompt, service };
};

describe('legacy Slack thread app mentions', () => {
    it('archives a mention-only legacy thread once at the root without a prompt', async () => {
        const { claimLegacySlackArchivedNotice, createSlackPrompt, service } =
            buildService();
        const say = vi.fn().mockResolvedValue(undefined);
        const invoke = (ts: string) =>
            service.handleAppMention({
                event: {
                    type: 'app_mention',
                    user: 'U123',
                    text: '<@U12345>',
                    channel: CHANNEL_ID,
                    ts,
                    thread_ts: THREAD_TS,
                },
                context: { teamId: 'T123', botUserId: 'BOT' },
                say,
                client: {},
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

        await invoke('1700000001.000100');
        await invoke('1700000002.000100');

        expect(claimLegacySlackArchivedNotice).toHaveBeenCalledTimes(2);
        expect(createSlackPrompt).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledTimes(1);
        expect(say).toHaveBeenCalledWith(
            expect.objectContaining({
                thread_ts: THREAD_TS,
                text: expect.stringContaining('archived'),
            }),
        );
    });
});
