import { defaultSessionUser } from '../../../auth/account/account.mock';
import { generateAgentResponse } from '../ai/agents/agentV2';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/agents/agentV2', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    generateAgentResponse: vi.fn(async () => {
        throw new Error('Boundary reached');
    }),
}));

vi.mock('../ai/models', () => ({
    getModel: vi.fn(() => ({ model: { modelId: 'test-model' } })),
}));

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return { resolveTools: async () => ({}) };
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

const runtimeOptions = {
    writeSpaceUuids: ['space'],
    externalUserId: 'viewer',
    spaceAccess: ['space'],
    readOnlySpaceUuids: [],
    userAttributeOverrides: {},
};

const user = {
    ...defaultSessionUser,
    organizationUuid: 'organization',
    userUuid: 'actor',
};

const prompt = {
    organizationUuid: 'organization',
    projectUuid: 'project',
    promptUuid: 'prompt',
    threadUuid: 'thread',
    threadCreatedFrom: 'web_app',
    battleProfile: null,
};

const agentSettings = {
    uuid: 'agent',
    enableDataAccess: true,
    enableContentTools: false,
    enableSqlMode: false,
    enableUserContext: true,
    tags: null,
    spaceAccess: [],
};

const stopAtBoundary = new Error('Boundary reached');
vi.mocked(generateAgentResponse).mockRejectedValue(stopAtBoundary);

const buildService = () => {
    const service = new AiAgentService({
        agentPermissionService: {
            loadRequest: vi.fn().mockResolvedValue({ enforcementMode: 'off' }),
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
        },
        orgAiCopilotConfigResolver: {
            getDecisionClient: vi.fn().mockResolvedValue(undefined),
            getCopilotConfig: vi.fn().mockResolvedValue({
                defaultProvider: 'openai',
            }),
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
            findAgentContextByThreadScoped: vi.fn().mockResolvedValue([]),
            findLatestProgressByRunUuids: vi.fn().mockResolvedValue([]),
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: false }),
        },
        groupsModel: { findUserGroups: vi.fn().mockResolvedValue([]) },
        aiAgentSkillModel: { findBoundToAgent: vi.fn().mockResolvedValue([]) },
        aiAgentReviewClassifierModel: {
            findReviewRemediationByWorkThread: vi.fn().mockResolvedValue(null),
        },
        aiAgentModel: {
            findThreadPromptSetup: vi.fn().mockResolvedValue({
                threadBinding: null,
                threadContext: null,
            }),
        },
        aiAgentToolsService: {
            canGenerateDataApp: vi.fn().mockResolvedValue(false),
            canAuthorContent: vi.fn().mockResolvedValue(false),
            listAgentSkills: vi.fn().mockResolvedValue([]),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const privateService = service as unknown as PrivateService;
    vi.spyOn(privateService, 'getIsCopilotEnabled').mockResolvedValue(true);
    vi.spyOn(privateService, 'getAgentSettings').mockResolvedValue(
        agentSettings,
    );
    vi.spyOn(privateService, 'getAgentRuntimeMcpServers').mockResolvedValue([]);
    vi.spyOn(privateService, 'createAuditedAbility').mockReturnValue({
        can: () => true,
    });
    return { privateService };
};

const conversation = {
    messageHistory: [] as [],
    compactionSummary: null,
    resolveMessageHistory: async () => [] as [],
};

describe('agent user identity by actor', () => {
    test.each([
        {
            name: 'service account embed',
            actor: { ...user, serviceAccount: { uuid: 'service-account' } },
            options: { runtimeOptions },
            expected: true,
        },
        {
            name: 'user embed',
            actor: user,
            options: { runtimeOptions },
            expected: false,
        },
        { name: 'in-app user', actor: user, options: {}, expected: false },
    ])(
        '$name marks the requesting user isServiceAccount $expected',
        async ({ actor, options, expected }) => {
            const { privateService } = buildService();
            vi.spyOn(
                privateService,
                'getAiAgentDependencies',
            ).mockResolvedValue({});

            await expect(
                privateService.generateOrStreamAgentResponse(
                    actor,
                    conversation,
                    {
                        prompt,
                        stream: false,
                        canManageAgent: false,
                        aiCreditCheck: null,
                        ...options,
                    },
                ),
            ).rejects.toBe(stopAtBoundary);
            expect(generateAgentResponse).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    args: expect.objectContaining({
                        requestingUser: expect.objectContaining({
                            isServiceAccount: expected,
                        }),
                    }),
                }),
            );
        },
    );
});
