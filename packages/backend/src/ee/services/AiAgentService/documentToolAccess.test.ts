import { defaultSessionUser } from '../../../auth/account/account.mock';
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
    getAgentRuntimeMcpServers: (...args: unknown[]) => Promise<unknown[]>;
    createAuditedAbility: (...args: unknown[]) => { can: () => boolean };
    getAiAgentDependencies: (
        user: unknown,
        prompt: unknown,
        options: { enableDocuments: boolean },
    ) => Promise<unknown>;
    generateOrStreamAgentResponse: (
        user: unknown,
        conversation: {
            messageHistory: [];
            compactionSummary: null;
            resolveMessageHistory: () => Promise<[]>;
        },
        options: {
            prompt: unknown;
            stream: false;
            canManageAgent: false;
            aiCreditCheck: null;
            runtimeOptions?: unknown;
        },
    ) => Promise<unknown>;
};

const embedRuntimeOptions = {
    writeSpaceUuids: ['write-space'],
    externalUserId: null,
    spaceAccess: ['write-space'],
    readOnlySpaceUuids: [],
    userAttributeOverrides: {},
};

describe('Document runtime access', () => {
    test.each([
        {
            name: 'trusted Slack',
            slack: true,
            trusted: true,
            canSaveCharts: true,
            canSaveDocuments: true,
            expected: true,
        },
        {
            name: 'untrusted Slack',
            slack: true,
            trusted: false,
            canSaveCharts: true,
            canSaveDocuments: true,
            expected: false,
        },
        {
            name: 'no space the user can save in',
            slack: false,
            trusted: true,
            canSaveCharts: false,
            canSaveDocuments: false,
            expected: false,
        },
        {
            name: 'authorized web',
            slack: false,
            trusted: true,
            canSaveCharts: true,
            canSaveDocuments: true,
            expected: true,
        },
        {
            name: 'charts without Documents',
            slack: false,
            trusted: true,
            canSaveCharts: true,
            canSaveDocuments: false,
            expected: false,
        },
        {
            name: 'Documents without charts',
            slack: false,
            trusted: true,
            canSaveCharts: false,
            canSaveDocuments: true,
            expected: true,
        },
        {
            name: 'embedded, a write space allows both',
            slack: false,
            trusted: true,
            canSaveCharts: true,
            canSaveDocuments: true,
            runtimeOptions: embedRuntimeOptions,
            expected: true,
        },
        {
            name: 'embedded, no write space allows Documents',
            slack: false,
            trusted: true,
            canSaveCharts: true,
            canSaveDocuments: false,
            runtimeOptions: embedRuntimeOptions,
            expected: false,
        },
        {
            name: 'embedded, a write space allows only Documents',
            slack: false,
            trusted: true,
            canSaveCharts: false,
            canSaveDocuments: true,
            runtimeOptions: embedRuntimeOptions,
            expected: true,
        },
    ])(
        '$name passes effective access to discovery and authoring',
        async ({
            slack,
            trusted,
            canSaveCharts,
            canSaveDocuments,
            runtimeOptions,
            expected,
        }: {
            slack: boolean;
            trusted: boolean;
            canSaveCharts: boolean;
            canSaveDocuments: boolean;
            runtimeOptions?: typeof embedRuntimeOptions;
            expected: boolean;
        }) => {
            const canAuthorContent = vi.fn().mockResolvedValue(canSaveCharts);
            const canAuthorDocuments = vi
                .fn()
                .mockResolvedValue(canSaveDocuments);
            const service = new AiAgentService({
                agentPermissionService: {
                    loadRequest: vi.fn().mockResolvedValue({
                        enforcementMode: 'off',
                    }),
                    assertOperation: vi.fn(),
                    assertActorVerifiedWithRequest: vi.fn(),
                    assertOperationWithRequest: vi.fn(),
                },
                aiCreditService: {
                    assertAiCreditsAvailable: async () => undefined,
                },
                aiThreadFileModel: {
                    findForThread: vi.fn().mockResolvedValue([]),
                    findClaimableByUser: vi.fn().mockResolvedValue([]),
                },
                lightdashConfig: {
                    ai: { copilot: { embeddingEnabled: false } },
                },
                aiOrganizationSettingsService: {
                    isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
                    isAiAgentReviewsEnabled: vi.fn().mockResolvedValue(false),
                },
                orgAiCopilotConfigResolver: {
                    getDecisionClient: vi.fn().mockResolvedValue(undefined),
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
                    get: vi.fn().mockResolvedValue({ enabled: false }),
                },
                aiAgentToolsService: {
                    canGenerateDataApp: vi.fn().mockResolvedValue(false),
                    canAuthorContent,
                    canAuthorDocuments,
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
                'getAgentRuntimeMcpServers',
            ).mockResolvedValue([]);
            vi.spyOn(privateService, 'createAuditedAbility').mockReturnValue({
                can: () => true,
            });
            const stopAtDependencies = new Error('Dependency boundary reached');
            const dependencies = vi
                .spyOn(privateService, 'getAiAgentDependencies')
                .mockRejectedValue(stopAtDependencies);
            const user = {
                ...defaultSessionUser,
                organizationUuid: 'organization',
                userUuid: 'user',
            };
            const prompt = {
                organizationUuid: 'organization',
                projectUuid: 'project',
                promptUuid: 'prompt',
                threadUuid: 'thread',
                battleProfile: null,
                ...(slack ? { slackUserId: 'slack-user' } : {}),
            };

            await expect(
                privateService.generateOrStreamAgentResponse(
                    user,
                    {
                        messageHistory: [],
                        compactionSummary: null,
                        resolveMessageHistory: async () => [],
                    },
                    {
                        prompt,
                        stream: false,
                        canManageAgent: false,
                        aiCreditCheck: null,
                        runtimeOptions,
                    },
                ),
            ).rejects.toBe(stopAtDependencies);
            if (!slack || trusted) {
                const writeSpaces = expect.objectContaining({
                    spaceUuids: runtimeOptions?.writeSpaceUuids ?? null,
                });
                expect(canAuthorContent).toHaveBeenCalledWith(writeSpaces);
                expect(canAuthorDocuments).toHaveBeenCalledWith(writeSpaces);
            }
            expect(dependencies).toHaveBeenCalledWith(
                user,
                prompt,
                expect.objectContaining({ enableDocuments: expected }),
            );
        },
    );
});
