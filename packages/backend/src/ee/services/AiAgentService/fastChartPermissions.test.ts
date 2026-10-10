import {
    AgentCapability,
    AiAccessRefusalReason,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
} from '@lightdash/common';
import { toSessionUser } from '../../../auth/account/account';
import { buildAccount } from '../../../auth/account/account.mock';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class {},
}));

type PrivateService = {
    tryApplyChartEdit: (args: unknown) => Promise<unknown>;
    searchFilterValueCandidates: (args: unknown) => Promise<unknown>;
    describeSingleValue: (args: unknown) => Promise<unknown>;
    resolveChartIntent: (args: unknown) => Promise<unknown>;
    getArtifactVizQuery: (args: unknown) => Promise<unknown>;
    getIsCopilotEnabled: () => Promise<boolean>;
    getAgentSettings: () => Promise<unknown>;
    getPromptDecisionClient: () => Promise<unknown>;
    completeChartEdit: () => Promise<unknown>;
    respondWithStaticText: () => Promise<unknown>;
};

const setup = () => {
    const account = buildAccount();
    const user = toSessionUser(account);
    const organizationUuid = account.organization.organizationUuid!;
    const policy: AgentCapabilityPolicy = {
        mode: 'managed',
        version: 1,
        allowedProjectUuids: null,
        allowedUserUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
    };
    const settings = { mcpAgentsEnabled: true, mcpContentWritesEnabled: true };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const permission = new AgentPermissionService({
        resolveResourceProjectUuid: vi.fn(),
        isCustomRolesLicensed: () => false,
        featureFlagModel,
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            save: vi.fn(),
        },
        agentWarehouseRestrictionConfirmationModel: {
            get: vi.fn(),
            getCurrentBindingFingerprint: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
        },
        userModel: {
            findSessionUserByUUIDInOrganization: vi.fn(),
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.VIEWER],
                customRoles: [],
            }),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({ organizationUuid }),
        },
        getOrganizationSettings: vi
            .fn()
            .mockImplementation(async () => settings),
        agentActionLogModel: { insert: vi.fn() },
    });
    const effects = {
        search: vi.fn().mockResolvedValue({ results: ['value'] }),
        query: vi.fn().mockResolvedValue({
            source: 'semantic',
            query: { queryUuid: 'query' },
        }),
        poll: vi.fn().mockResolvedValue({ status: 'error' }),
        save: vi.fn().mockResolvedValue({ versionUuid: 'saved' }),
    };
    const service = new AiAgentService({
        agentPermissionService: permission,
        projectService: { searchFieldUniqueValues: effects.search },
        asyncQueryService: { getAsyncQueryResults: effects.poll },
        aiAgentModel: {
            createOrUpdateArtifact: effects.save,
            getArtifact: vi.fn().mockResolvedValue({ versionUuid: 'version' }),
            hasAiPromptInterrupt: vi.fn().mockResolvedValue(false),
        },
        analytics: { track: vi.fn() },
        featureFlagService: featureFlagModel,
        aiOrganizationSettingsService: {
            isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const privateService = service as unknown as PrivateService;
    const resolve = vi
        .spyOn(privateService, 'resolveChartIntent')
        .mockResolvedValue({
            type: 'resolved',
            edit: {
                changed: true,
                config: { config: { title: 'Chart' } },
                response: 'Updated',
            },
            undoneTo: null,
            explore: {},
        });
    vi.spyOn(privateService, 'completeChartEdit').mockResolvedValue(null);
    vi.spyOn(privateService, 'respondWithStaticText').mockResolvedValue({
        stream: true,
    });
    vi.spyOn(privateService, 'getArtifactVizQuery').mockImplementation(
        effects.query,
    );
    vi.spyOn(privateService, 'getIsCopilotEnabled').mockResolvedValue(true);
    vi.spyOn(privateService, 'getAgentSettings').mockResolvedValue({
        uuid: 'agent',
        projectUuid: 'project',
    });
    const decisions = vi.spyOn(privateService, 'getPromptDecisionClient');
    const prompt = {
        organizationUuid,
        projectUuid: 'project',
        agentUuid: 'agent',
        threadUuid: 'thread',
        promptUuid: 'prompt',
        prompt: 'filter values',
    };
    const args = {
        user,
        prompt,
        projectUuid: 'project',
        agent: { uuid: 'agent' },
        exploreName: 'orders',
        fieldId: 'orders_id',
        chart: {
            latest: { artifactUuid: 'artifact', versionUuid: 'version' },
            artifact: { title: 'Chart' },
        },
        resolution: { type: 'needs_values' },
        artifact: { artifactUuid: 'artifact', versionUuid: 'version' },
        config: {
            config: {
                queryConfig: {
                    dimensions: [],
                    metrics: ['orders_total'],
                    tableCalculations: [],
                },
            },
        },
        explore: {},
    };
    return {
        service,
        privateService,
        user,
        prompt,
        args,
        policy,
        settings,
        featureFlagModel,
        effects,
        resolve,
        decisions,
    };
};

const denials = [
    ['query', AiAccessRefusalReason.AGENT_CAPABILITY_DENIED],
    ['project', AiAccessRefusalReason.AGENT_PROJECT_DENIED],
    ['switch', AiAccessRefusalReason.AGENT_ACCESS_DISABLED],
    ['user', AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED],
] as const;

test.each(denials)(
    'fast chart paths stop before effects when %s is denied',
    async (denial, reason) => {
        const h = setup();
        if (denial === 'query') h.policy.systemRoleMatrix.viewer = [];
        if (denial === 'user') h.policy.allowedUserUuids = [];
        if (denial === 'project') h.policy.allowedProjectUuids = [];
        if (denial === 'switch') h.settings.mcpAgentsEnabled = false;
        await Promise.all(
            (
                [
                    'tryApplyChartEdit',
                    'searchFilterValueCandidates',
                    'describeSingleValue',
                ] as const
            ).map((method) =>
                expect(h.privateService[method](h.args)).rejects.toMatchObject({
                    refusal: { reason },
                }),
            ),
        );
        expect(h.resolve).not.toHaveBeenCalled();
        Object.values(h.effects).forEach((effect) =>
            expect(effect).not.toHaveBeenCalled(),
        );
    },
);

test.each(denials.slice(1))(
    'the real turn rejects %s before fast decisions',
    async (denial, reason) => {
        const h = setup();
        if (denial === 'user') h.policy.allowedUserUuids = [];
        if (denial === 'project') h.policy.allowedProjectUuids = [];
        if (denial === 'switch') h.settings.mcpAgentsEnabled = false;
        await expect(
            h.service.generateOrStreamAgentResponse(
                h.user,
                { messageHistory: [], compactionSummary: null } as never,
                {
                    prompt: h.prompt,
                    stream: true,
                    aiCreditCheck: null,
                    canManageAgent: true,
                } as never,
            ),
        ).rejects.toMatchObject({ refusal: { reason } });
        expect(h.decisions).not.toHaveBeenCalled();
    },
);

test.each(['off', 'legacy', 'managed'] as const)(
    '%s permits the existing chart effects when allowed',
    async (mode) => {
        const h = setup();
        if (mode === 'off')
            h.featureFlagModel.get.mockResolvedValue({ enabled: false });
        if (mode === 'legacy') h.policy.mode = 'legacy';
        if (mode !== 'managed') {
            h.policy.systemRoleMatrix.viewer = [];
            h.settings.mcpAgentsEnabled = false;
            h.policy.allowedProjectUuids = [];
            h.policy.allowedUserUuids = [];
        }
        await h.privateService.tryApplyChartEdit(h.args);
        await h.privateService.searchFilterValueCandidates({
            ...h.args,
            prompt: 'value',
        });
        await h.privateService.describeSingleValue(h.args);
        expect(h.resolve).toHaveBeenCalledOnce();
        expect(h.effects.save).toHaveBeenCalledOnce();
        expect(h.effects.search).toHaveBeenCalled();
        expect(h.effects.query).toHaveBeenCalledOnce();
        expect(h.effects.poll).toHaveBeenCalledOnce();
    },
);
