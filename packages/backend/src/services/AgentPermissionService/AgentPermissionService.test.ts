import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    ForbiddenError,
    type AgentCapabilityPolicy,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromOauth } from '../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import { HUMAN_ONLY_IN_MANAGED } from '../../auth/agentPermissions/humanOnlyInManaged';
import { AgentPermissionService, evaluate } from './AgentPermissionService';

const setup = () => {
    const account = buildAccount();
    const policy: AgentCapabilityPolicy = {
        version: 1,
        // Raw SQL, the default operation below, is outside this list.
        allowedCapabilities: [AgentCapability.Query],
        allowedGroupUuids: null,
    };
    const deps = {
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
        areGroupsAvailable: vi.fn().mockResolvedValue(true),
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            getForEnforcement: vi.fn().mockImplementation(async () => ({
                ...policy,
                storedAllowedGroupUuids: policy.allowedGroupUuids,
                hasExistingAllowedGroup:
                    policy.allowedGroupUuids === null
                        ? null
                        : policy.allowedGroupUuids.length > 0,
            })),
            save: vi.fn(),
            getProjectPolicies: vi.fn().mockResolvedValue([]),
            saveProjectPolicy: vi.fn(),
            deleteProjectPolicy: vi.fn(),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
        },

        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
    };
    const service = new AgentPermissionService(deps);
    const operation = {
        account,
        organizationUuid: account.organization.organizationUuid!,
        projectUuid: 'project',
        kind: 'rest_operation' as const,
        key: 'SqlRunnerController.runSql',
        surface: AgentActorSurface.MCP,
    };
    return { account, policy, deps, service, operation };
};

test.each(['off', 'legacy'] as const)(
    '%s leaves existing behavior unchanged',
    async (mode) => {
        const { service, deps, operation, policy } = setup();
        policy.allowedCapabilities = [];
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else policy.allowedCapabilities = null;
        await expect(
            service.assertOperation({ ...operation, key: 'unknown' }),
        ).resolves.toBeUndefined();
        expect(deps.groupsModel.findUserInGroups).not.toHaveBeenCalled();
        expect(
            deps.agentCapabilityPolicyModel.getForEnforcement,
        ).toHaveBeenCalledTimes(mode === 'off' ? 0 : 1);
        expect(deps.projectModel.getSummary).not.toHaveBeenCalled();

        expect(deps.featureFlagModel.get).toHaveBeenCalledWith({
            user: { organizationUuid: operation.organizationUuid },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
    },
);

test('a custom role with no agent scopes gets every capability the policy allows', async () => {
    const { service, policy, account, operation } = setup();
    // What a custom role carrying no agent scopes gives the person: the
    // service never reads roles, so only the policy decides.
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'view', subject: 'Project' },
    ]);
    const allowed = [
        AgentCapability.Query,
        AgentCapability.RawSql,
        AgentCapability.Export,
    ];
    const excluded = Object.values(AgentCapability).filter(
        (capability) => !allowed.includes(capability),
    );
    policy.allowedCapabilities = allowed;
    expect((await service.resolvePolicy(operation)).capabilities).toEqual(
        new Set(allowed),
    );
    await Promise.all(
        allowed.map((capability) =>
            expect(
                service.assertOperation({
                    ...operation,
                    kind: 'capability',
                    key: capability,
                }),
            ).resolves.toBeUndefined(),
        ),
    );
    await Promise.all(
        excluded.map((capability) =>
            expect(
                service.assertOperation({
                    ...operation,
                    kind: 'capability',
                    key: capability,
                }),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    capability,
                    policyLayer: 'organization_setting',
                    settingsUrl: '/generalSettings/agentIdentity',
                },
            }),
        ),
    );
    policy.allowedCapabilities = Object.values(AgentCapability);
    expect((await service.resolvePolicy(operation)).capabilities).toEqual(
        new Set(Object.values(AgentCapability)),
    );
    await Promise.all(
        Object.values(AgentCapability).map((capability) =>
            expect(
                service.assertOperation({
                    ...operation,
                    kind: 'capability',
                    key: capability,
                }),
            ).resolves.toBeUndefined(),
        ),
    );
});

test('does not use an admin manage:all ability to supply capabilities', async () => {
    const { service, account, operation } = setup();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: {
            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            capability: AgentCapability.RawSql,
        },
    });
});

test('refuses unmapped operations and requires external_tools for connected tools', async () => {
    const { service, operation } = setup();
    await expect(
        service.assertOperation({ ...operation, key: 'unknown' }),
    ).rejects.toMatchObject({
        refusal: {
            reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED,
            settingsUrl: null,
        },
    });
    await expect(
        service.assertOperation({
            ...operation,
            kind: 'connected_mcp_tool',
            key: 'new/server/tool',
            connectedTool: {
                serverUuid: 'server',
                toolName: 'tool',
                enabledToolNames: ['tool'],
            },
        }),
    ).rejects.toMatchObject({
        refusal: {
            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            capability: AgentCapability.ExternalTools,
        },
    });
});

test('raw SQL is allowed when the policy lists it, with no confirmation dependency', async () => {
    const { policy, service, deps, operation } = setup();
    policy.allowedCapabilities = [AgentCapability.RawSql];
    await expect(service.assertOperation(operation)).resolves.toBeUndefined();
    expect(Object.keys(deps)).not.toContain(
        'agentWarehouseRestrictionConfirmationModel',
    );
});

test.each([
    AgentActorSurface.IN_APP_AGENT,
    AgentActorSurface.SLACK_AGENT,
    AgentActorSurface.API,
    AgentActorSurface.MCP,
])(
    'the permission check has no MCP settings dependency on %s',
    async (surface) => {
        const { policy, service, deps, operation } = setup();
        policy.allowedCapabilities = [AgentCapability.ContentWrite];
        expect(deps).not.toHaveProperty('getOrganizationSettings');
        await expect(
            service.assertOperation({
                ...operation,
                surface,
                key: 'ProjectController.createDashboard',
            }),
        ).resolves.toBeUndefined();
        await expect(
            service.assertOperation({
                ...operation,
                surface,
                kind: 'agent_turn',
                key: 'agent_turn',
            }),
        ).resolves.toBeUndefined();
    },
);

test('pure evaluation is suitable for tool filtering', () => {
    expect(
        evaluate(
            {
                mode: 'off',
                capabilities: null,
                allowedCapabilities: null,
                allowedGroupUuids: null,
                version: 0,
            },
            {
                requiredCapabilities: null,
                projectUuid: null,
            },
        ),
    ).toBeNull();
});

test('a refusal remains authoritative when audit storage fails', async () => {
    const { service, deps, operation } = setup();
    deps.agentActionLogModel.insert.mockRejectedValue(
        new Error('storage unavailable'),
    );
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
    });
    expect(deps.agentActionLogModel.insert).toHaveBeenCalledWith(
        expect.objectContaining({
            object_id: operation.key,
            outcome: 'denied',
            reason_code: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        }),
    );
});

test('checks the organization flag again on each resolution', async () => {
    const { service, deps, operation } = setup();
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
    });
    deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    await expect(service.assertOperation(operation)).resolves.toBeUndefined();
    deps.featureFlagModel.get.mockResolvedValue({ enabled: true });
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
    });
});

test('allows connected tools only with the external_tools capability', async () => {
    const { policy, service, deps, operation } = setup();
    policy.allowedCapabilities = [AgentCapability.ExternalTools];
    await expect(
        service.assertOperation({
            ...operation,
            kind: 'connected_mcp_tool',
            key: 'server/tool',
            connectedTool: {
                serverUuid: 'server',
                toolName: 'tool',
                enabledToolNames: ['tool'],
            },
        }),
    ).resolves.toBeUndefined();
});

test.each(['off', 'legacy', 'managed'] as const)(
    'checks an unverified actor only in managed mode: %s',
    async (mode) => {
        const { service, policy, deps, operation } = setup();
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else
            policy.allowedCapabilities =
                mode === 'legacy'
                    ? null
                    : (policy.allowedCapabilities ??
                      Object.values(AgentCapability));
        const result = service.assertActorVerified({
            ...operation,
            surface: AgentActorSurface.SLACK_AGENT,
            actorVerified: false,
        });
        if (mode === 'managed') {
            await expect(result).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
                    action: 'sign_in',
                    settingsUrl: null,
                },
            });
            expect(deps.agentActionLogModel.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    reason_code: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
                }),
            );
        } else {
            await expect(result).resolves.toBeUndefined();
            expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
        }
    },
);

test('logs the capability, operation, policy, project and surface without arguments', async () => {
    const { service, deps, operation } = setup();
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { capability: AgentCapability.RawSql },
    });
    expect(deps.agentActionLogModel.insert).toHaveBeenCalledWith(
        expect.objectContaining({
            capability: AgentCapability.RawSql,
            policy_version: 1,
            policy_layer: 'organization_setting',
            object_id: operation.key,
            project_uuid: operation.projectUuid,
            agent_identity: expect.objectContaining({
                act: expect.objectContaining({ surface: operation.surface }),
            }),
        }),
    );
});

test.each(['off', 'legacy', 'managed'] as const)(
    'resolves managed activation without project lookups: %s',
    async (mode) => {
        const { service, deps, policy, operation } = setup();
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else
            policy.allowedCapabilities =
                mode === 'legacy'
                    ? null
                    : (policy.allowedCapabilities ??
                      Object.values(AgentCapability));
        await expect(
            service.isManaged(operation.organizationUuid),
        ).resolves.toBe(mode === 'managed');
        expect(deps.projectModel.getSummary).not.toHaveBeenCalled();
        if (mode === 'off')
            expect(
                deps.agentCapabilityPolicyModel.getForEnforcement,
            ).not.toHaveBeenCalled();
    },
);

test('resolves a resource project using the trusted resource lookup', async () => {
    const { service, deps } = setup();
    deps.resolveResourceProjectUuid.mockResolvedValue('resolved-project');
    await expect(
        service.resolveResourceProjectUuid({
            type: 'dashboard',
            uuid: 'dashboard',
        }),
    ).resolves.toBe('resolved-project');
    expect(deps.resolveResourceProjectUuid).toHaveBeenCalledExactlyOnceWith({
        type: 'dashboard',
        uuid: 'dashboard',
    });
});

test.each([...HUMAN_ONLY_IN_MANAGED])(
    'keeps %s human-only even when every capability is granted',
    async (key) => {
        const { policy, service, operation, deps } = setup();
        policy.allowedCapabilities = Object.values(AgentCapability);
        operation.account.user.ability = new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'all' },
        ]);
        await expect(
            service.assertOperation({ ...operation, key }),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                capability: AgentCapability.Administration,
                settingsUrl: '/generalSettings/agentIdentity',
            },
        });
        expect(deps.agentActionLogModel.insert).toHaveBeenCalledOnce();
    },
);

const admissionSurfaces = [
    ['mcp_tool', 'read_content', AgentActorSurface.MCP],
    ['agent_tool', 'getMetadata', AgentActorSurface.IN_APP_AGENT],
    ['agent_tool', 'getMetadata', AgentActorSurface.SLACK_AGENT],
    ['agent_turn', 'agent_turn', AgentActorSurface.IN_APP_AGENT],
    ['agent_turn', 'agent_turn', AgentActorSurface.SLACK_AGENT],
    ['rest_operation', 'UserController.getAccount', AgentActorSurface.API],
] as const;

describe.each(admissionSurfaces)(
    '%s %s on %s admission',
    (kind, key, surface) => {
        test.each(['legacy', 'managed'] as const)(
            'ignores historical lists in %s',
            async (mode) => {
                const { service, policy, operation, deps } = setup();
                policy.allowedCapabilities =
                    mode === 'legacy' ? null : [AgentCapability.ReadDiscover];
                deps.agentCapabilityPolicyModel.getForEnforcement.mockImplementation(
                    async () => ({
                        ...policy,
                        allowed_user_uuids: ['excluded-person'],
                        allowed_project_uuids: ['excluded-project'],
                        storedAllowedGroupUuids: null,
                        hasExistingAllowedGroup: null,
                    }),
                );
                await expect(
                    service.assertOperation({
                        ...operation,
                        kind,
                        key,
                        surface,
                    }),
                ).resolves.toBeUndefined();
            },
        );
    },
);

test('group admission precedes capability checks without granting capabilities', async () => {
    const { service, policy, account, operation } = setup();
    policy.allowedGroupUuids = [];
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
    });
    policy.allowedGroupUuids = null;
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
    });
});

test('an account from another organization cannot use this organization policy', async () => {
    const { service, operation, deps } = setup();
    await expect(
        service.assertOperation({
            ...operation,
            organizationUuid: 'another-organization',
            kind: 'agent_turn',
            key: 'agent_turn',
        }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.projectModel.getSummary).not.toHaveBeenCalled();
});

test('names organization permissions when Export is missing and preserves refusal data', async () => {
    const { service, operation } = setup();
    const key = 'render_chart';
    await expect(
        service.assertOperation({ ...operation, kind: 'mcp_tool', key }),
    ).rejects.toMatchObject({
        message:
            "Your organization's agent permissions do not allow Export results. Ask an admin to change Permissions on the Agents page.",
        refusal: {
            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            policyLayer: 'organization_setting',
            capability: AgentCapability.Export,
            settingsUrl: '/generalSettings/agentIdentity',
            operation: key,
            policyVersion: 1,
            projectUuid: operation.projectUuid,
            message:
                "Your organization's agent permissions do not allow Export results. Ask an admin to change Permissions on the Agents page.",
        },
    });
});

const newHumanOnlyOperations = [
    'FeatureFlagController.setFeatureFlagOverride',
    'FeatureFlagController.deleteFeatureFlagOverride',
    'GoogleDriveController.get',
    'AiAgentAdminController.upsertSettings',
];

test.each(newHumanOnlyOperations)(
    'refuses %s with all capabilities and admin rights',
    async (key) => {
        const { policy, service, operation, deps } = setup();
        policy.allowedCapabilities = Object.values(AgentCapability);
        operation.account.user.ability = new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'all' },
        ]);
        await expect(
            service.assertOperation({ ...operation, key }),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                policyLayer: 'organization_setting',
                capability: AgentCapability.Administration,
            },
        });
    },
);

const toolEffectFixtures = [
    [
        'createContent.sql_chart',
        [AgentCapability.ContentWrite, AgentCapability.RawSql],
    ],
    [
        'editContent.sql_chart',
        [AgentCapability.ContentWrite, AgentCapability.RawSql],
    ],
    [
        'editContent.composer_chart_sql',
        [AgentCapability.ContentWrite, AgentCapability.RawSql],
    ],
    [
        'editRepo.delete_file',
        [AgentCapability.Delete, AgentCapability.DbtWriteback],
    ],
] as const;

test.each(toolEffectFixtures)(
    'enforces all requirements for %s',
    async (key, required) => {
        const { policy, service, operation, deps } = setup();
        const effect = { ...operation, kind: 'tool_effect' as const, key };
        policy.allowedCapabilities = [...required];
        await expect(service.assertOperation(effect)).resolves.toBeUndefined();
        await Promise.all(
            required.map(async (missing) => {
                const missingSetup = setup();
                const held = required.filter(
                    (capability) => capability !== missing,
                );
                missingSetup.policy.allowedCapabilities = held;
                await expect(
                    missingSetup.service.assertOperation({
                        ...missingSetup.operation,
                        kind: 'tool_effect',
                        key,
                    }),
                ).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                        capability: missing,
                        operation: key,
                    },
                });
            }),
        );
    },
);

test.each(['unknown', 'toString', 'constructor', '__proto__'])(
    'denies unknown tool effect %s',
    async (key) => {
        const { policy, service, operation, deps } = setup();
        policy.allowedCapabilities = Object.values(AgentCapability);
        await expect(
            service.assertOperation({ ...operation, kind: 'tool_effect', key }),
        ).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED },
        });
    },
);

test.each(['off', 'legacy'] as const)(
    '%s bypasses every new managed check',
    async (mode) => {
        const { service, operation, policy, deps } = setup();
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else policy.allowedCapabilities = null;
        await Promise.all([
            ...[
                ...newHumanOnlyOperations,
                'ProjectCoderController.upsertGoogleSheetsSyncAsCode',
                'ProjectCoderController.legacyUpsertGoogleSheetsSyncAsCode',
            ].map((key) =>
                expect(
                    service.assertOperation({ ...operation, key }),
                ).resolves.toBeUndefined(),
            ),
            ...[...toolEffectFixtures.map(([name]) => name), 'unknown'].map(
                (key) =>
                    expect(
                        service.assertOperation({
                            ...operation,
                            kind: 'tool_effect',
                            key,
                        }),
                    ).resolves.toBeUndefined(),
            ),
        ]);
        expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
    },
);

const parityCases = [
    'allowed',
    'off',
    'legacy',
    'admission',
    'human',
    'disabled',
    'unmapped',
    ...Object.values(AgentCapability),
] as const;

const paritySetup = (scenario: (typeof parityCases)[number]) => {
    const fixture = setup();
    const { policy, deps, operation } = fixture;
    policy.allowedCapabilities = Object.values(AgentCapability);
    operation.key = 'SchedulerController.post';
    if (scenario === 'off')
        deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    if (scenario === 'legacy') policy.allowedCapabilities = null;
    if (scenario === 'admission') policy.allowedGroupUuids = [];
    if (scenario === 'human')
        operation.key = 'AgentPermissionController.saveCeiling';
    if (scenario === 'disabled') policy.allowedCapabilities = [];
    if (scenario === 'unmapped') operation.key = 'unknown';
    const capabilityOperations: Record<AgentCapability, string> = {
        read_discover: 'SavedChartController.getChartHistory',
        query: 'SavedChartController.postChartResults',
        raw_sql: 'SqlRunnerController.runSql',
        content_write: 'SchedulerController.post',
        delete: 'ContentController.deleteContent',
        publish: 'SchedulerController.post',
        deploy_upload: 'DeployController.deployExplores',
        dbt_writeback: 'GitFilesController.saveFile',
        export: 'QueryController.scheduleDownloadResults',
        administration: 'UserAvatarController.updateMyAvatar',
        external_tools: '',
    };
    if (Object.values(AgentCapability).includes(scenario as AgentCapability)) {
        policy.allowedCapabilities = Object.values(AgentCapability).filter(
            (c) => c !== scenario,
        );
        operation.key = capabilityOperations[scenario as AgentCapability];
    }
    const args =
        scenario === AgentCapability.ExternalTools
            ? {
                  ...operation,
                  kind: 'connected_mcp_tool' as const,
                  key: 'tool',
                  connectedTool: {
                      serverUuid: 'server',
                      toolName: 'tool',
                      enabledToolNames: ['tool'],
                  },
              }
            : operation;
    return { ...fixture, operation: args };
};

const refusalFrom = async (promise: Promise<void>) => {
    try {
        await promise;
        return null;
    } catch (error) {
        if (!(error instanceof AiAccessRefusedError)) throw error;
        return error.refusal;
    }
};

test.each(parityCases)('existing refusal snapshot: %s', async (scenario) => {
    const { service, deps, operation } = paritySetup(scenario);
    const refusal = await refusalFrom(service.assertOperation(operation));
    const {
        requiredCapabilities,
        blockers,
        blockersComplete,
        explanationUrl,
        ...existing
    } = refusal ?? {};
    expect(refusal ? existing : null).toMatchSnapshot();
    expect(deps.agentActionLogModel.insert).toHaveBeenCalledTimes(
        refusal ? 1 : 0,
    );
    if (Object.values(AgentCapability).includes(scenario as AgentCapability)) {
        expect(refusal).toMatchObject({
            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            capability: scenario,
        });
    }
});

test('collects missing delivery capabilities in order', async () => {
    const { policy, service, operation, deps } = setup();
    policy.allowedCapabilities = [AgentCapability.Query];

    const refusal = await refusalFrom(
        service.assertOperation({
            ...operation,
            key: 'SchedulerController.post',
        }),
    );
    expect(refusal).toMatchObject({
        requiredCapabilities: [
            AgentCapability.ContentWrite,
            AgentCapability.Publish,
        ],
        blockersComplete: true,
        blockers: [
            {
                checkId: 'capability:content_write',
                capability: AgentCapability.ContentWrite,
            },
            {
                checkId: 'capability:publish',
                capability: AgentCapability.Publish,
            },
        ],
        explanationUrl: '/generalSettings/myAgentConnections',
    });

    expect(deps.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
});

test('raw SQL without its capability has no setup blockers', async () => {
    const { service, operation } = setup();
    const refusal = await refusalFrom(service.assertOperation(operation));
    expect(refusal).toMatchObject({
        reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        capability: AgentCapability.RawSql,
    });
    expect(refusal?.blockers).toMatchObject([
        {
            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            status: 'refused',
        },
    ]);
    expect(refusal?.blockers?.map((blocker) => blocker.checkId)).not.toContain(
        'warehouse_confirmation',
    );
    expect(refusal?.blockers?.map((blocker) => blocker.status)).not.toContain(
        'setup_needed',
    );
});

test.each(['hidden_by_scope', 'hidden_by_project', 'visible'] as const)(
    'runtime diagnostics respect OAuth visibility: %s',
    async (visibility) => {
        const { service, operation, deps, policy } = setup();
        policy.allowedGroupUuids = [];

        const account = fromOauth(
            {
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>([
                    {
                        action: 'view',
                        subject: 'Project',
                        conditions: {
                            organizationUuid: operation.organizationUuid,
                            projectUuid:
                                visibility === 'hidden_by_project'
                                    ? 'another-project'
                                    : operation.projectUuid,
                        },
                    },
                ]),
            },
            {
                accessToken: 'test-token',
                client: { id: 'test-client' },
                scope: visibility === 'hidden_by_scope' ? [] : ['read'],
            },
            {
                mode: 'enforce',
                getRequest: () => ({ method: null, routeTemplate: null }),
            },
        );
        const refusal = await refusalFrom(
            service.assertOperation({ ...operation, account }),
        );
        const {
            blockers,
            blockersComplete,
            requiredCapabilities,
            explanationUrl,
            ...primary
        } = refusal!;
        expect(primary).toEqual(
            new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                {
                    operation: operation.key,
                    policyVersion: policy.version,
                    projectUuid: operation.projectUuid,
                    policyLayer: 'organization_setting',
                },
            ).refusal,
        );
        const visible = visibility === 'visible';
        expect(blockersComplete).toBe(visible);
        expect(blockers?.map((blocker) => blocker.checkId)).toEqual(
            visible
                ? ['agent_admission', 'capability:raw_sql']
                : ['agent_admission'],
        );
        if (!visible) {
            expect(JSON.stringify(blockers)).not.toContain(
                '/generalSettings/projectManagement/',
            );
        }
    },
);

test('hidden project diagnostics retain the primary capability refusal', async () => {
    const { service, operation, account } = setup();
    account.user.ability = new Ability<PossibleAbilities>([]);
    const refusal = await refusalFrom(service.assertOperation(operation));
    expect(refusal).toMatchObject({
        reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        capability: AgentCapability.RawSql,
        blockers: [{ checkId: 'capability:raw_sql' }],
        blockersComplete: false,
    });
});

test.each(['allowed', 'off', 'legacy'] as const)(
    'preserves read counts: %s',
    async (scenario) => {
        const { service, deps, operation } = paritySetup(scenario);
        await refusalFrom(service.assertOperation(operation));
        const managed = scenario !== 'off' && scenario !== 'legacy';
        expect(deps.featureFlagModel.get).toHaveBeenCalledTimes(1);
        expect(
            deps.agentCapabilityPolicyModel.getForEnforcement,
        ).toHaveBeenCalledTimes(scenario === 'off' ? 0 : 1);
        expect(deps.projectModel.getSummary).toHaveBeenCalledTimes(
            managed ? 1 : 0,
        );
    },
);

test('raw SQL the policy lists only reads the remaining policy inputs', async () => {
    const { policy, service, operation, deps } = setup();
    policy.allowedCapabilities = [AgentCapability.RawSql];
    await expect(service.assertOperation(operation)).resolves.toBeUndefined();
    expect(deps.featureFlagModel.get).toHaveBeenCalledTimes(1);
    expect(
        deps.agentCapabilityPolicyModel.getForEnforcement,
    ).toHaveBeenCalledTimes(1);
    expect(deps.projectModel.getSummary).toHaveBeenCalledExactlyOnceWith(
        operation.projectUuid,
    );

    expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
});

test('all independent blockers are ordered and disclose no role sources or project lists', async () => {
    const { service, operation, deps, policy } = setup();
    policy.allowedGroupUuids = ['another-group'];
    policy.allowedCapabilities = [AgentCapability.Query];

    const refusal = await refusalFrom(
        service.assertOperation({
            ...operation,
            kind: 'tool_effect',
            key: 'createContent.sql_chart',
        }),
    );
    expect(refusal?.blockers?.map((blocker) => blocker.checkId)).toEqual([
        'agent_admission',
        'capability:content_write',
        'capability:raw_sql',
    ]);
    expect(
        new Set(refusal?.blockers?.map((blocker) => blocker.checkId)).size,
    ).toBe(refusal?.blockers?.length);
    expect(JSON.stringify(refusal)).not.toMatch(
        /another-person|another-project|sourceAssignments|bindingFingerprint/,
    );
});

test('content writes do not need an organization settings read', async () => {
    const { policy, service, operation, deps } = setup();
    policy.allowedCapabilities = [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ];
    await expect(
        service.assertOperation({
            ...operation,
            key: 'SchedulerController.post',
        }),
    ).resolves.toBeUndefined();
});

test.each([true, false])(
    'legacy group admission checks membership once (member %s)',
    async (member) => {
        const { service, deps, operation, policy } = setup();
        policy.allowedCapabilities = null;
        policy.allowedGroupUuids = ['group'];

        deps.groupsModel.findUserInGroups.mockResolvedValue(
            member
                ? [{ groupUuid: 'group', userUuid: operation.account.user.id }]
                : [],
        );
        if (member)
            await expect(
                service.assertOperation(operation),
            ).resolves.toBeUndefined();
        else {
            await expect(
                service.assertOperation(operation),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    requiredCapabilities: [],
                    blockers: [
                        expect.objectContaining({ checkId: 'agent_admission' }),
                    ],
                    blockersComplete: true,
                },
            });
            expect(deps.agentActionLogModel.insert).toHaveBeenCalledOnce();
        }
        expect(
            deps.agentCapabilityPolicyModel.getForEnforcement,
        ).toHaveBeenCalledOnce();
        expect(
            deps.groupsModel.findUserInGroups,
        ).toHaveBeenCalledExactlyOnceWith({
            userUuid: operation.account.user.id,
            organizationUuid: operation.organizationUuid,
            groupUuids: ['group'],
        });
        expect(deps.projectModel.getSummary).not.toHaveBeenCalled();

        expect(deps.areGroupsAvailable).not.toHaveBeenCalled();
    },
);

test('an all-deleted group restriction refuses without a membership query', async () => {
    const { service, deps, operation, policy } = setup();
    policy.allowedCapabilities = null;
    policy.allowedGroupUuids = [];
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
    });
    expect(deps.groupsModel.findUserInGroups).not.toHaveBeenCalled();
});

test.each(['legacy', 'managed'] as const)(
    'membership failures never admit a person in %s',
    async (mode) => {
        const { service, deps, operation, policy } = setup();
        policy.allowedCapabilities =
            mode === 'legacy'
                ? null
                : (policy.allowedCapabilities ??
                  Object.values(AgentCapability));
        policy.allowedGroupUuids = ['group'];
        deps.groupsModel.findUserInGroups.mockRejectedValue(
            new Error('membership unavailable'),
        );
        await expect(service.assertOperation(operation)).rejects.toThrow(
            'membership unavailable',
        );
    },
);

test.each([true, false])(
    'managed group admission precedes capability refusals (member %s)',
    async (member) => {
        const { service, deps, operation, policy } = setup();
        policy.allowedGroupUuids = ['group'];
        deps.groupsModel.findUserInGroups.mockResolvedValue(
            member ? [{ groupUuid: 'group' }] : [],
        );
        await expect(service.assertOperation(operation)).rejects.toMatchObject({
            refusal: {
                reason: member
                    ? AiAccessRefusalReason.AGENT_CAPABILITY_DENIED
                    : AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            },
        });
        expect(deps.groupsModel.findUserInGroups).toHaveBeenCalledOnce();
        expect(deps.projectModel.getSummary).toHaveBeenCalledOnce();
    },
);

test('legacy restriction requires a verified actor and records the refusal', async () => {
    const { service, deps, operation, policy } = setup();
    policy.allowedCapabilities = null;
    policy.allowedGroupUuids = ['group'];
    await expect(
        service.assertActorVerified({ ...operation, actorVerified: false }),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED },
    });
    expect(deps.agentActionLogModel.insert).toHaveBeenCalledOnce();
    expect(deps.groupsModel.findUserInGroups).not.toHaveBeenCalled();
});

test('flag off ignores even a saved group restriction without policy or membership reads', async () => {
    const { service, deps, operation, policy } = setup();
    policy.allowedGroupUuids = [];
    deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    await service.assertOperation(operation);
    await service.assertActorVerified({ ...operation, actorVerified: false });
    expect(
        deps.agentCapabilityPolicyModel.getForEnforcement,
    ).not.toHaveBeenCalled();
    expect(deps.groupsModel.findUserInGroups).not.toHaveBeenCalled();
});

test.each([
    {
        mode: 'off',
        restricted: true,
        member: false,
        policies: 0,
        memberships: 0,
        managed: 0,
    },
    {
        mode: 'legacy',
        restricted: false,
        member: false,
        policies: 1,
        memberships: 0,
        managed: 0,
    },
    {
        mode: 'legacy',
        restricted: true,
        member: true,
        policies: 1,
        memberships: 1,
        managed: 0,
    },
    {
        mode: 'legacy',
        restricted: true,
        member: false,
        policies: 1,
        memberships: 1,
        managed: 0,
    },
    {
        mode: 'managed',
        restricted: false,
        member: false,
        policies: 1,
        memberships: 0,
        managed: 1,
    },
    {
        mode: 'managed',
        restricted: true,
        member: true,
        policies: 1,
        memberships: 1,
        managed: 1,
    },
    {
        mode: 'managed',
        restricted: true,
        member: false,
        policies: 1,
        memberships: 1,
        managed: 1,
    },
] as const)(
    'pins operation read counts: %j',
    async ({ mode, restricted, member, policies, memberships, managed }) => {
        const h = setup();
        h.policy.allowedCapabilities =
            mode === 'legacy'
                ? null
                : (h.policy.allowedCapabilities ??
                  Object.values(AgentCapability));
        h.policy.allowedGroupUuids = restricted ? ['group'] : null;
        h.deps.featureFlagModel.get.mockResolvedValue({
            enabled: mode !== 'off',
        });
        h.deps.groupsModel.findUserInGroups.mockResolvedValue(
            member ? [{ groupUuid: 'group' }] : [],
        );
        const operation = h.service.assertOperation({
            ...h.operation,
            key: 'QuerySourceController.executeSourceQueries',
        });
        if (mode !== 'off' && restricted && !member)
            await expect(operation).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                },
            });
        else await expect(operation).resolves.toBeUndefined();
        expect(h.deps.featureFlagModel.get).toHaveBeenCalledOnce();
        expect(
            h.deps.agentCapabilityPolicyModel.getForEnforcement,
        ).toHaveBeenCalledTimes(policies);
        expect(h.deps.groupsModel.findUserInGroups).toHaveBeenCalledTimes(
            memberships,
        );
        expect(h.deps.projectModel.getSummary).toHaveBeenCalledTimes(managed);

        expect(h.deps.areGroupsAvailable).not.toHaveBeenCalled();
    },
);

describe('organization capability list', () => {
    test('refuses a capability outside the list and records the organization remedy', async () => {
        const { service, policy, deps, operation } = setup();
        Object.assign(policy, { allowedCapabilities: [AgentCapability.Query] });
        await expect(service.assertOperation(operation)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                policyLayer: 'organization_setting',
                settingsUrl: '/generalSettings/agentIdentity',
                blockers: expect.arrayContaining([
                    expect.objectContaining({
                        checkId: 'capability:raw_sql',
                        policyLayer: 'organization_setting',
                        settingsUrl: '/generalSettings/agentIdentity',
                    }),
                ]),
            },
        });
        expect(deps.agentActionLogModel.insert).toHaveBeenCalledWith(
            expect.objectContaining({ policy_layer: 'organization_setting' }),
        );
    });
    test('no capability list allows every capability', async () => {
        const { service, policy, deps, operation } = setup();
        Object.assign(policy, { allowedCapabilities: null });
        await expect(
            service.assertOperation(operation),
        ).resolves.toBeUndefined();
    });
    test.each(Object.values(AgentActorSurface))(
        'an empty list refuses turns on %s',
        async (surface) => {
            const { service, policy, deps, operation } = setup();
            Object.assign(policy, { allowedCapabilities: [] });
            await expect(
                service.assertOperation({
                    ...operation,
                    surface,
                    kind: 'agent_turn',
                    key: 'agent_turn',
                }),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
                    policyLayer: 'organization_setting',
                    settingsUrl: '/generalSettings/agentIdentity',
                },
            });
            Object.assign(policy, {
                allowedCapabilities: [AgentCapability.Query],
            });
            await expect(
                service.assertOperation({
                    ...operation,
                    surface,
                    kind: 'agent_turn',
                    key: 'agent_turn',
                }),
            ).resolves.toBeUndefined();
        },
    );
});

test('diagnostic evaluation failure retains the group refusal', async () => {
    const { service, policy, operation, deps } = setup();
    policy.allowedGroupUuids = [];
    // Raw SQL is listed, so its check reaches the resolved capabilities.
    policy.allowedCapabilities = Object.values(AgentCapability);
    const resolved = await service.resolvePolicy(operation);
    vi.spyOn(resolved.capabilities!, 'has').mockImplementation(() => {
        throw new Error('diagnostic failed');
    });
    vi.spyOn(
        service as unknown as {
            resolveManagedPolicy: AgentPermissionService['resolvePolicy'];
        },
        'resolveManagedPolicy',
    ).mockResolvedValue(resolved);
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: {
            reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            blockersComplete: false,
        },
    });
    expect(deps.agentActionLogModel.insert).toHaveBeenCalledOnce();
});

describe('project restrictions', () => {
    const rawSql = (projectUuid: string) => ({
        projectUuid,
        kind: 'capability' as const,
        key: AgentCapability.RawSql,
    });
    const withoutRawSql = Object.values(AgentCapability).filter(
        (capability) => capability !== AgentCapability.RawSql,
    );

    test('a project list replaces the organization list for that project only', async () => {
        const { policy, service, deps, operation } = setup();
        policy.allowedCapabilities = null;
        deps.agentCapabilityPolicyModel.getProjectPolicies.mockResolvedValue([
            { projectUuid: 'restricted', allowedCapabilities: withoutRawSql },
        ]);
        await expect(
            service.assertOperation({ ...operation, ...rawSql('open') }),
        ).resolves.toBeUndefined();
        await expect(
            service.assertOperation({ ...operation, ...rawSql('restricted') }),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                capability: AgentCapability.RawSql,
                policyLayer: 'project_scope',
                settingsUrl:
                    '/generalSettings/projectManagement/restricted/agentIdentity',
            },
        });
        await expect(
            service.assertOperation({
                ...operation,
                projectUuid: 'restricted',
                kind: 'capability',
                key: AgentCapability.Query,
            }),
        ).resolves.toBeUndefined();
    });

    test('a project can restrict agents when the organization does not', async () => {
        const { service, deps, operation, policy } = setup();
        policy.allowedCapabilities = null;
        policy.allowedCapabilities = null;
        deps.agentCapabilityPolicyModel.getProjectPolicies.mockResolvedValue([
            { projectUuid: 'restricted', allowedCapabilities: withoutRawSql },
        ]);
        expect(
            (await service.loadRequest(operation.organizationUuid))
                .enforcementMode,
        ).toBe('managed');
        await expect(
            service.assertOperation({ ...operation, ...rawSql('open') }),
        ).resolves.toBeUndefined();
        await expect(
            service.assertOperation({ ...operation, ...rawSql('restricted') }),
        ).rejects.toMatchObject({
            refusal: { policyLayer: 'project_scope' },
        });
    });

    test('a project with no restrictions overrides an organization restriction', async () => {
        const { service, deps, operation, policy } = setup();
        policy.allowedCapabilities = withoutRawSql;
        deps.agentCapabilityPolicyModel.getProjectPolicies.mockResolvedValue([
            { projectUuid: 'open', allowedCapabilities: null },
        ]);
        await expect(
            service.assertOperation({ ...operation, ...rawSql('open') }),
        ).resolves.toBeUndefined();
        await expect(
            service.assertOperation({ ...operation, ...rawSql('other') }),
        ).rejects.toMatchObject({
            refusal: { policyLayer: 'organization_setting' },
        });
    });

    test('a project with no restrictions does not turn enforcement on', async () => {
        const { service, deps, operation, policy } = setup();
        policy.allowedCapabilities = null;
        deps.agentCapabilityPolicyModel.getProjectPolicies.mockResolvedValue([
            { projectUuid: 'open', allowedCapabilities: null },
        ]);
        expect(
            (await service.loadRequest(operation.organizationUuid))
                .enforcementMode,
        ).toBe('off');
    });

    test('project restrictions are not read when agent identity is off', async () => {
        const { service, deps, operation } = setup();
        deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        await service.assertOperation({
            ...operation,
            ...rawSql('restricted'),
        });
        expect(
            deps.agentCapabilityPolicyModel.getProjectPolicies,
        ).not.toHaveBeenCalled();
    });
});
