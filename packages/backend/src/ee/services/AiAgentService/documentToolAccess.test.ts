import { FeatureFlags } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

type PrivateService = {
    getIsCopilotEnabled: () => Promise<boolean>;
    getAgentSettings: (...args: unknown[]) => Promise<unknown>;
    canCreateDashboardsInProject: (...args: unknown[]) => Promise<boolean>;
    getAgentRuntimeMcpServers: (...args: unknown[]) => Promise<unknown[]>;
    createAuditedAbility: (...args: unknown[]) => { can: () => boolean };
    getAiAgentDependencies: (
        user: unknown,
        prompt: unknown,
        options: { enableDocuments: boolean },
    ) => Promise<unknown>;
    generateOrStreamAgentResponse: (
        user: unknown,
        conversation: { messageHistory: []; compactionSummary: null },
        options: { prompt: unknown; stream: false; canManageAgent: false },
    ) => Promise<unknown>;
};

describe('Document runtime access', () => {
    test.each([
        {
            name: 'trusted Slack',
            slack: true,
            trusted: true,
            authorized: true,
            enabled: true,
            expected: true,
        },
        {
            name: 'untrusted Slack',
            slack: true,
            trusted: false,
            authorized: true,
            enabled: true,
            expected: false,
        },
        {
            name: 'denied ContentAsCode',
            slack: false,
            trusted: true,
            authorized: false,
            enabled: true,
            expected: false,
        },
        {
            name: 'disabled Documents flag',
            slack: false,
            trusted: true,
            authorized: true,
            enabled: false,
            expected: false,
        },
        {
            name: 'authorized web',
            slack: false,
            trusted: true,
            authorized: true,
            enabled: true,
            expected: true,
        },
    ])(
        '$name passes effective access to discovery and authoring',
        async ({ slack, trusted, authorized, enabled, expected }) => {
            const service = new AiAgentService({
                lightdashConfig: {
                    ai: { copilot: { embeddingEnabled: false } },
                },
                aiOrganizationSettingsService: {
                    isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
                },
                slackAuthenticationModel: {
                    getInstallationFromOrganizationUuid: vi
                        .fn()
                        .mockResolvedValue({ aiRequireOAuth: trusted }),
                },
                projectModel: {
                    get: vi.fn().mockResolvedValue({
                        projectUuid: 'project',
                        organizationUuid: 'organization',
                        dbtConnection: { type: 'dbt' },
                    }),
                },
                aiAgentDocumentModel: {
                    findAllContextForAgent: vi.fn().mockResolvedValue([]),
                },
                aiDeepResearchRunModel: {
                    findAgentContextByThreadScoped: vi
                        .fn()
                        .mockResolvedValue([]),
                    findLatestProgressByRunUuids: vi.fn().mockResolvedValue([]),
                },
                featureFlagService: {
                    get: vi
                        .fn()
                        .mockImplementation(
                            async ({
                                featureFlagId,
                            }: {
                                featureFlagId: FeatureFlags;
                            }) => ({
                                enabled:
                                    featureFlagId === FeatureFlags.Documents &&
                                    enabled,
                            }),
                        ),
                },
                aiAgentToolsService: {
                    canGenerateDataApp: vi.fn().mockResolvedValue(false),
                },
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            const privateService = service as unknown as PrivateService;
            vi.spyOn(privateService, 'getIsCopilotEnabled').mockResolvedValue(
                true,
            );
            vi.spyOn(privateService, 'getAgentSettings').mockResolvedValue({
                uuid: 'agent',
                enableDataAccess: true,
                enableContentTools: true,
                enableSqlMode: false,
            });
            vi.spyOn(
                privateService,
                'canCreateDashboardsInProject',
            ).mockResolvedValue(false);
            vi.spyOn(
                privateService,
                'getAgentRuntimeMcpServers',
            ).mockResolvedValue([]);
            vi.spyOn(privateService, 'createAuditedAbility').mockReturnValue({
                can: () => authorized,
            });
            const stopAtDependencies = new Error('Dependency boundary reached');
            const dependencies = vi
                .spyOn(privateService, 'getAiAgentDependencies')
                .mockRejectedValue(stopAtDependencies);
            const user = { organizationUuid: 'organization', userUuid: 'user' };
            const prompt = {
                organizationUuid: 'organization',
                projectUuid: 'project',
                promptUuid: 'prompt',
                threadUuid: 'thread',
                ...(slack ? { slackUserId: 'slack-user' } : {}),
            };

            await expect(
                privateService.generateOrStreamAgentResponse(
                    user,
                    { messageHistory: [], compactionSummary: null },
                    { prompt, stream: false, canManageAgent: false },
                ),
            ).rejects.toBe(stopAtDependencies);
            expect(dependencies).toHaveBeenCalledWith(
                user,
                prompt,
                expect.objectContaining({ enableDocuments: expected }),
            );
        },
    );
});
