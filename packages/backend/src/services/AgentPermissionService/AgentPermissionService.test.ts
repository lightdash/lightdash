import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
    type PossibleAbilities,
} from '@lightdash/common';
import { buildAccount } from '../../auth/account/account.mock';
import { HUMAN_ONLY_IN_MANAGED } from '../../auth/agentPermissions/humanOnlyInManaged';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
    evaluate,
} from './AgentPermissionService';

const setup = () => {
    const account = buildAccount();
    const matrix = agentSystemRoleMatrix([]);
    const policy: AgentCapabilityPolicy = {
        mode: 'managed',
        version: 1,
        allowedProjectUuids: null,
        allowedUserUuids: null,
        systemRoleMatrix: { ...matrix, viewer: [AgentCapability.Query] },
    };
    const deps = {
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        isCustomRolesLicensed: vi.fn().mockReturnValue(true),
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            save: vi.fn(),
        },
        agentWarehouseRestrictionConfirmationModel: {
            get: vi.fn().mockResolvedValue(null),
            getCurrentBindingFingerprint: vi.fn().mockResolvedValue('current'),
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
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
        },
        getOrganizationSettings: vi.fn().mockResolvedValue({
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
        }),
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
        policy.allowedUserUuids = [];
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else policy.mode = 'legacy';
        await expect(
            service.assertOperation({ ...operation, key: 'unknown' }),
        ).resolves.toBeUndefined();
        expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();
        expect(deps.getOrganizationSettings).not.toHaveBeenCalled();
        expect(deps.featureFlagModel.get).toHaveBeenCalledWith({
            user: { organizationUuid: operation.organizationUuid },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
    },
);

test('unions system and custom assignments without a system-role veto', async () => {
    const { service, deps, operation } = setup();
    deps.userModel.getAgentRoleAssignments.mockResolvedValue({
        systemRoles: [OrganizationMemberRole.VIEWER],
        customRoles: [
            { roleUuid: 'direct', scopes: ['view:AgentRawSql'] },
            { roleUuid: 'group', scopes: ['view:AgentExport'] },
            { roleUuid: 'extra', scopes: ['view:AgentContentWrite'] },
        ],
    });
    expect((await service.resolvePolicy(operation)).capabilities).toEqual(
        new Set([
            AgentCapability.Query,
            AgentCapability.RawSql,
            AgentCapability.Export,
            AgentCapability.ContentWrite,
        ]),
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

test('applies project limits and only permits org-level discovery without a project', async () => {
    const { service, policy, operation } = setup();
    policy.allowedProjectUuids = [];
    policy.systemRoleMatrix.viewer = [
        AgentCapability.ReadDiscover,
        AgentCapability.Query,
    ];
    await expect(
        service.assertOperation({
            ...operation,
            key: 'QuerySourceController.executeSourceQueries',
        }),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED },
    });
    await expect(
        service.assertOperation({
            ...operation,
            projectUuid: null,
            key: 'UserController.getAccount',
        }),
    ).resolves.toBeUndefined();
    await expect(
        service.assertOperation({
            ...operation,
            projectUuid: null,
            key: 'QuerySourceController.executeSourceQueries',
        }),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED },
    });
});

test('raw SQL requires a current confirmation and a fingerprint change voids it', async () => {
    const { service, policy, deps, operation } = setup();
    policy.systemRoleMatrix.viewer = [AgentCapability.RawSql];
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED },
    });
    deps.agentWarehouseRestrictionConfirmationModel.get.mockResolvedValue({
        bindingFingerprint: 'current',
    });
    await expect(service.assertOperation(operation)).resolves.toBeUndefined();
    deps.agentWarehouseRestrictionConfirmationModel.getCurrentBindingFingerprint.mockResolvedValue(
        'new',
    );
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED },
    });
});

test('the organization write switch bounds content writes', async () => {
    const { service, policy, deps, operation } = setup();
    policy.systemRoleMatrix.viewer = [AgentCapability.ContentWrite];
    deps.getOrganizationSettings.mockResolvedValue({
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: false,
    });
    await expect(
        service.assertOperation({
            ...operation,
            key: 'ProjectController.createDashboard',
        }),
    ).rejects.toMatchObject({
        refusal: {
            reason: AiAccessRefusalReason.AGENT_SETTING_DENIED,
            capability: AgentCapability.ContentWrite,
        },
    });
});

test('the organization admission switch denies every managed surface', async () => {
    const { service, deps, operation } = setup();
    deps.getOrganizationSettings.mockResolvedValue({
        mcpAgentsEnabled: false,
        mcpContentWritesEnabled: true,
    });
    await expect(
        service.assertOperation({
            ...operation,
            key: 'QuerySourceController.executeSourceQueries',
        }),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED },
    });
});

test('pure evaluation is suitable for tool filtering', () => {
    expect(
        evaluate(
            {
                mode: 'off',
                capabilities: null,
                allowedProjectUuids: null,
                allowedUserUuids: null,
                version: 0,
                editableCustomRoleUuid: null,
            },
            {
                requiredCapabilities: null,
                projectUuid: null,
                mcpAgentsEnabled: false,
                mcpContentWritesEnabled: false,
                warehouseConfirmed: false,
                isOrganizationDiscovery: false,
            },
        ),
    ).toBeNull();
});

test('returns a role remedy only when the caller can edit it', async () => {
    const { service, deps, account, operation } = setup();
    deps.userModel.getAgentRoleAssignments.mockResolvedValue({
        systemRoles: [],
        customRoles: [{ roleUuid: 'custom', scopes: [] }],
    });
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { settingsUrl: '/generalSettings/agentIdentity' },
    });
    account.user.ability = new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'Organization',
            conditions: { organizationUuid: operation.organizationUuid },
        },
    ]);
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { settingsUrl: '/generalSettings/customRoles/custom' },
    });
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

test('uses the organization remedy when custom roles cannot be edited without a license', async () => {
    const { service, deps, account, operation } = setup();
    deps.isCustomRolesLicensed.mockReturnValue(false);
    deps.userModel.getAgentRoleAssignments.mockResolvedValue({
        systemRoles: [],
        customRoles: [{ roleUuid: 'custom', scopes: [] }],
    });
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { settingsUrl: '/generalSettings/agentIdentity' },
    });
});

test('allows connected tools only with the external_tools capability', async () => {
    const { service, policy, operation } = setup();
    policy.systemRoleMatrix.viewer = [AgentCapability.ExternalTools];
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
        else policy.mode = mode;
        deps.userModel.getAgentRoleAssignments.mockRejectedValue(
            new Error('unverified actor has no role assignments'),
        );
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
            policy_layer: 'org_ceiling',
            object_id: operation.key,
            project_uuid: operation.projectUuid,
            agent_identity: expect.objectContaining({
                act: expect.objectContaining({ surface: operation.surface }),
            }),
        }),
    );
});

test.each(['off', 'legacy', 'managed'] as const)(
    'resolves managed activation without role or project lookups: %s',
    async (mode) => {
        const { service, deps, policy, operation } = setup();
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else policy.mode = mode;
        await expect(
            service.isManaged(operation.organizationUuid),
        ).resolves.toBe(mode === 'managed');
        expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();
        expect(deps.projectModel.getSummary).not.toHaveBeenCalled();
        if (mode === 'off')
            expect(deps.agentCapabilityPolicyModel.get).not.toHaveBeenCalled();
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

test.each([
    ['rest_operation', 'SavedChartController.getChartHistory'],
    ['mcp_tool', 'read_content'],
    ['agent_tool', 'getMetadata'],
] as const)(
    'refuses unresolved project discovery for %s %s when projects are limited',
    async (kind, key) => {
        const { service, policy, operation } = setup();
        policy.allowedProjectUuids = ['project'];
        policy.systemRoleMatrix.viewer = [AgentCapability.ReadDiscover];
        await expect(
            service.assertOperation({
                ...operation,
                projectUuid: null,
                kind,
                key,
            }),
        ).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED },
        });
    },
);

test('turn admission checks the project and switch without requiring a capability', async () => {
    const { service, operation, policy, deps } = setup();
    policy.systemRoleMatrix.viewer = [];
    const turn = {
        ...operation,
        kind: 'agent_turn' as const,
        key: 'agent_turn',
    };
    await expect(service.assertOperation(turn)).resolves.toBeUndefined();
    policy.allowedProjectUuids = [];
    await expect(service.assertOperation(turn)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED },
    });
    deps.getOrganizationSettings.mockResolvedValue({
        mcpAgentsEnabled: false,
        mcpContentWritesEnabled: true,
    });
    await expect(service.assertOperation(turn)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED },
    });
});

test.each([...HUMAN_ONLY_IN_MANAGED])(
    'keeps %s human-only even when every capability is granted',
    async (key) => {
        const { service, policy, operation, deps } = setup();
        policy.systemRoleMatrix.viewer = Object.values(AgentCapability);
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
        test.each(['listed', 'unlisted', 'unrestricted', 'empty'] as const)(
            '%s user list',
            async (list) => {
                const { service, policy, account, operation, deps } = setup();
                const allowedUserLists = {
                    unrestricted: null,
                    empty: [],
                    listed: [account.user.id],
                    unlisted: ['another-user'],
                };
                policy.allowedUserUuids = allowedUserLists[list];
                policy.systemRoleMatrix.viewer = [AgentCapability.ReadDiscover];
                const result = service.assertOperation({
                    ...operation,
                    kind,
                    key,
                    surface,
                });
                if (list === 'listed' || list === 'unrestricted') {
                    await expect(result).resolves.toBeUndefined();
                } else {
                    await expect(result).rejects.toMatchObject({
                        refusal: {
                            reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                            settingsUrl: '/generalSettings/agentIdentity',
                            message:
                                'Your account is not allowed to use agents. Ask an organization admin to update agent access.',
                        },
                    });
                    expect(
                        deps.agentActionLogModel.insert,
                    ).toHaveBeenCalledWith(
                        expect.objectContaining({
                            reason_code:
                                AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                            policy_version: 1,
                        }),
                    );
                }
            },
        );
    },
);

test('user admission precedes capability checks without granting capabilities', async () => {
    const { service, policy, account, operation } = setup();
    policy.allowedUserUuids = [];
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
    });
    policy.allowedUserUuids = [account.user.id];
    await expect(service.assertOperation(operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
    });
});

test('a stale listed user cannot bypass current organization membership', async () => {
    const { service, policy, account, operation, deps } = setup();
    policy.allowedUserUuids = [account.user.id];
    deps.userModel.getAgentRoleAssignments.mockRejectedValue(
        new ForbiddenError('Your account does not belong to this organization'),
    );
    await expect(
        service.assertOperation({
            ...operation,
            kind: 'agent_turn',
            key: 'agent_turn',
        }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.userModel.getAgentRoleAssignments).toHaveBeenCalledWith(
        account.user.id,
        operation.organizationUuid,
        operation.projectUuid,
    );
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
            policyLayer: 'org_ceiling',
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
        const { service, operation, policy } = setup();
        policy.systemRoleMatrix.viewer = Object.values(AgentCapability);
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
        'editRepo.delete_file',
        [AgentCapability.Delete, AgentCapability.DbtWriteback],
    ],
] as const;

test.each(toolEffectFixtures)(
    'enforces all requirements for %s',
    async (key, required) => {
        const { service, operation, policy, deps } = setup();
        const effect = { ...operation, kind: 'tool_effect' as const, key };
        deps.agentWarehouseRestrictionConfirmationModel.get.mockResolvedValue({
            bindingFingerprint: 'current',
        });
        policy.systemRoleMatrix.viewer = [...required];
        await expect(service.assertOperation(effect)).resolves.toBeUndefined();
        await Promise.all(
            required.map(async (missing) => {
                const missingSetup = setup();
                missingSetup.policy.systemRoleMatrix.viewer = required.filter(
                    (capability) => capability !== missing,
                );
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
        const { service, operation, policy } = setup();
        policy.systemRoleMatrix.viewer = Object.values(AgentCapability);
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
        policy.systemRoleMatrix.viewer = [];
        if (mode === 'off')
            deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        else policy.mode = 'legacy';
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
        expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();
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
    'project',
    ...Object.values(AgentCapability),
    'writes',
    'missing',
    'stale',
] as const;

const paritySetup = (scenario: (typeof parityCases)[number]) => {
    const fixture = setup();
    const { policy, deps, operation } = fixture;
    policy.systemRoleMatrix.viewer = Object.values(AgentCapability);
    deps.agentWarehouseRestrictionConfirmationModel.get.mockResolvedValue({
        bindingFingerprint: 'current',
    });
    operation.key = 'SchedulerController.post';
    if (scenario === 'off')
        deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    if (scenario === 'legacy') policy.mode = 'legacy';
    if (scenario === 'admission') policy.allowedUserUuids = [];
    if (scenario === 'human')
        operation.key = 'AgentPermissionController.saveCeiling';
    if (scenario === 'disabled')
        deps.getOrganizationSettings.mockResolvedValue({
            mcpAgentsEnabled: false,
            mcpContentWritesEnabled: true,
        });
    if (scenario === 'unmapped') operation.key = 'unknown';
    if (scenario === 'project') policy.allowedProjectUuids = [];
    if (scenario === 'writes')
        deps.getOrganizationSettings.mockResolvedValue({
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: false,
        });
    if (scenario === 'missing' || scenario === 'stale') {
        operation.key = 'SqlRunnerController.runSql';
        deps.agentWarehouseRestrictionConfirmationModel.get.mockResolvedValue(
            scenario === 'missing' ? null : { bindingFingerprint: 'old' },
        );
    }
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
        policy.systemRoleMatrix.viewer = Object.values(AgentCapability).filter(
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

test.each(parityCases)(
    'explain matches runtime and never writes: %s',
    async (scenario) => {
        const { service, deps, operation } = paritySetup(scenario);
        operation.account.user.ability = new Ability<PossibleAbilities>([
            ...operation.account.user.ability.rules,
            { action: 'create', subject: 'ScheduledDeliveries' },
        ]);
        const refusal = await refusalFrom(service.assertOperation(operation));
        vi.clearAllMocks();
        const audited = vi.spyOn(service as never, 'createAuditedAbility');
        const promise = service.explain({
            ...operation,
            action: {
                type: 'operation',
                kind: operation.kind,
                key: operation.key,
                connectedTool:
                    'connectedTool' in operation
                        ? operation.connectedTool
                        : undefined,
            },
        });
        if (scenario === 'off') {
            await expect(promise).rejects.toBeInstanceOf(
                FeatureNotEnabledError,
            );
        } else {
            const result = await promise;
            expect(result.mainReason).toEqual(refusal);
            expect(result.policyMainReason).toEqual(refusal);
            expect(result.coverage).toBe('checked_permissions_only');
            expect(result.checks.slice(-2)).toMatchObject([
                {
                    kind: 'connection_grant',
                    status: 'not_checked',
                    message: 'Connection grant: not checked yet.',
                },
                {
                    kind: 'warehouse_access',
                    status: 'not_checked',
                    message: 'Warehouse access is not verified.',
                },
            ]);
            if (scenario === 'legacy') {
                expect(result).toMatchObject({
                    mode: 'legacy',
                    result: 'not_checked',
                    mainReason: null,
                    blockers: [],
                });
                expect(result.checks).toHaveLength(3);
            } else {
                expect(result.checks.map((check) => check.kind)).toEqual([
                    'person_permission',
                    'agent_admission',
                    'human_only',
                    'agent_enabled',
                    'operation_mapping',
                    'project_scope',
                    ...result.requiredCapabilities.map(() => 'capability'),
                    'content_writes',
                    'warehouse_confirmation',
                    'connection_grant',
                    'warehouse_access',
                ]);
                let expectedResult = 'refused';
                if (scenario === 'allowed') expectedResult = 'allowed';
                else if (['missing', 'stale'].includes(scenario))
                    expectedResult = 'setup_needed';
                expect(result.result).toBe(expectedResult);
            }
        }
        expect(audited).not.toHaveBeenCalled();
        expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
        expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
        expect(
            deps.agentWarehouseRestrictionConfirmationModel.upsert,
        ).not.toHaveBeenCalled();
        expect(
            deps.agentWarehouseRestrictionConfirmationModel.delete,
        ).not.toHaveBeenCalled();
    },
);

test('collects missing delivery capabilities and the write switch in order', async () => {
    const { service, operation, policy, deps } = setup();
    policy.systemRoleMatrix.viewer = [];
    deps.getOrganizationSettings.mockResolvedValue({
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: false,
    });
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
            {
                checkId: 'content_writes',
                reason: AiAccessRefusalReason.AGENT_SETTING_DENIED,
            },
        ],
        explanationUrl: '/generalSettings/myAgentConnections',
    });
    expect(deps.getOrganizationSettings).toHaveBeenCalledTimes(1);
    expect(deps.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
});

test('collects warehouse setup behind a missing capability without exposing fingerprints', async () => {
    const { service, operation, deps } = setup();
    const refusal = await refusalFrom(service.assertOperation(operation));
    expect(refusal?.blockers).toMatchObject([
        { reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED },
        {
            reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
            status: 'setup_needed',
        },
    ]);
    expect(
        deps.agentWarehouseRestrictionConfirmationModel.get,
    ).toHaveBeenCalledTimes(1);
    expect(
        deps.agentWarehouseRestrictionConfirmationModel
            .getCurrentBindingFingerprint,
    ).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(refusal)).not.toContain('bindingFingerprint');
});

test.each(['settings', 'confirmation', 'fingerprint'] as const)(
    'diagnostic %s failure retains the primary refusal',
    async (source) => {
        const { service, operation, deps, policy } = setup();
        if (source === 'settings') {
            policy.allowedUserUuids = [];
            deps.getOrganizationSettings.mockRejectedValue(
                new Error('diagnostic failed'),
            );
        } else if (source === 'confirmation')
            deps.agentWarehouseRestrictionConfirmationModel.get.mockRejectedValue(
                new Error('diagnostic failed'),
            );
        else
            deps.agentWarehouseRestrictionConfirmationModel.getCurrentBindingFingerprint.mockRejectedValue(
                new Error('diagnostic failed'),
            );
        const refusal = await refusalFrom(service.assertOperation(operation));
        expect(refusal).toMatchObject({
            reason:
                source === 'settings'
                    ? AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED
                    : AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            blockersComplete: false,
        });
        expect(refusal?.blockers?.[0].reason).toBe(refusal?.reason);
        expect(deps.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
    },
);

test.each(['allowed', 'off', 'legacy', 'missing', 'stale'] as const)(
    'preserves read counts: %s',
    async (scenario) => {
        const { service, deps, operation } = paritySetup(scenario);
        await refusalFrom(service.assertOperation(operation));
        const managed = scenario !== 'off' && scenario !== 'legacy';
        expect(deps.featureFlagModel.get).toHaveBeenCalledTimes(1);
        expect(deps.agentCapabilityPolicyModel.get).toHaveBeenCalledTimes(
            scenario === 'off' ? 0 : 1,
        );
        expect(deps.userModel.getAgentRoleAssignments).toHaveBeenCalledTimes(
            managed ? 1 : 0,
        );
        expect(deps.projectModel.getSummary).toHaveBeenCalledTimes(
            managed ? 1 : 0,
        );
        expect(deps.getOrganizationSettings).toHaveBeenCalledTimes(
            managed ? 1 : 0,
        );
        expect(
            deps.agentWarehouseRestrictionConfirmationModel.get,
        ).toHaveBeenCalledTimes(
            ['missing', 'stale'].includes(scenario) ? 1 : 0,
        );
    },
);

test.each(['missing', 'stale', 'current', 'both_absent'] as const)(
    'explain confirmation: %s',
    async (state) => {
        const { service, operation, policy, deps } = setup();
        policy.systemRoleMatrix.viewer = [AgentCapability.RawSql];
        deps.agentWarehouseRestrictionConfirmationModel.get.mockResolvedValue(
            state === 'missing' || state === 'both_absent'
                ? undefined
                : { bindingFingerprint: state },
        );
        if (state === 'both_absent')
            deps.agentWarehouseRestrictionConfirmationModel.getCurrentBindingFingerprint.mockResolvedValue(
                undefined,
            );
        const result = await service.explain({
            ...operation,
            action: { type: 'capability', capability: AgentCapability.RawSql },
        });
        expect(
            result.checks.find(
                (check) => check.kind === 'warehouse_confirmation',
            ),
        ).toMatchObject({
            status: state === 'current' ? 'allowed' : 'setup_needed',
            ...(state === 'stale'
                ? { message: 'The connection changed since it was confirmed.' }
                : {}),
        });
        expect(JSON.stringify(result)).not.toContain('bindingFingerprint');
    },
);

test('explain preserves all granting sources and a custom grant absent from the matrix', async () => {
    const { service, deps, operation, policy } = setup();
    policy.systemRoleMatrix.viewer = [AgentCapability.Query];
    policy.systemRoleMatrix.editor = [AgentCapability.Query];
    const sources = [
        {
            role: { kind: 'system', role: OrganizationMemberRole.VIEWER },
            assignment: 'organization',
            projectUuid: null,
            groupUuid: null,
        },
        {
            role: { kind: 'system', role: OrganizationMemberRole.EDITOR },
            assignment: 'project_user',
            projectUuid: 'project',
            groupUuid: null,
        },
        {
            role: { kind: 'system', role: OrganizationMemberRole.EDITOR },
            assignment: 'project_group',
            projectUuid: 'project',
            groupUuid: 'group',
        },
        {
            role: { kind: 'custom', roleUuid: 'custom', name: 'Analyst' },
            assignment: 'extra_organization',
            projectUuid: null,
            groupUuid: null,
        },
    ];
    deps.userModel.getAgentRoleAssignments.mockResolvedValue({
        systemRoles: [
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.EDITOR,
        ],
        customRoles: [
            {
                roleUuid: 'custom',
                scopes: ['view:AgentQuery', 'view:AgentRawSql'],
            },
        ],
        sourceAssignments: sources,
    });
    const result = await service.explain({
        ...operation,
        action: { type: 'capability', capability: AgentCapability.Query },
    });
    expect(
        result.checks.find((check) => check.kind === 'capability')
            ?.sourceAssignments,
    ).toEqual(sources);
    const raw = await service.explain({
        ...operation,
        action: { type: 'capability', capability: AgentCapability.RawSql },
    });
    expect(
        raw.checks.find((check) => check.kind === 'capability'),
    ).toMatchObject({ status: 'allowed', sourceAssignments: [sources[3]] });
});

test('admin remedy uses plain ability without audit during explain', async () => {
    const { service, operation, account } = setup();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const result = await service.explain({
        ...operation,
        action: { type: 'operation', kind: operation.kind, key: operation.key },
    });
    expect(result.mainReason?.explanationUrl).toBe(
        '/generalSettings/agentIdentity#test-agent-access',
    );
});

test('bounds diagnostics when a confirmation read does not finish', async () => {
    vi.useFakeTimers();
    try {
        const { service, operation, deps } = setup();
        deps.agentWarehouseRestrictionConfirmationModel.get.mockImplementation(
            () => new Promise(() => {}),
        );
        const promise = refusalFrom(service.assertOperation(operation));
        await vi.advanceTimersByTimeAsync(2000);
        expect(await promise).toMatchObject({
            reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            blockersComplete: false,
        });
        expect(deps.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
    } finally {
        vi.useRealTimers();
    }
});

test('current confirmation does not add allowed-path reads', async () => {
    const { service, operation, deps, policy } = setup();
    policy.systemRoleMatrix.viewer = [AgentCapability.RawSql];
    deps.agentWarehouseRestrictionConfirmationModel.get.mockResolvedValue({
        bindingFingerprint: 'current',
    });
    await expect(service.assertOperation(operation)).resolves.toBeUndefined();
    expect(deps.featureFlagModel.get).toHaveBeenCalledTimes(1);
    expect(deps.agentCapabilityPolicyModel.get).toHaveBeenCalledTimes(1);
    expect(
        deps.userModel.getAgentRoleAssignments,
    ).toHaveBeenCalledExactlyOnceWith(
        operation.account.user.id,
        operation.organizationUuid,
        operation.projectUuid,
    );
    expect(deps.getOrganizationSettings).toHaveBeenCalledTimes(1);
    expect(
        deps.agentWarehouseRestrictionConfirmationModel.get,
    ).toHaveBeenCalledTimes(1);
    expect(
        deps.agentWarehouseRestrictionConfirmationModel
            .getCurrentBindingFingerprint,
    ).toHaveBeenCalledTimes(1);
    expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
});

test('all independent blockers are ordered and disclose no role sources or project lists', async () => {
    const { service, operation, deps, policy } = setup();
    policy.allowedUserUuids = ['another-person'];
    policy.allowedProjectUuids = ['another-project'];
    policy.systemRoleMatrix.viewer = [];
    deps.getOrganizationSettings.mockResolvedValue({
        mcpAgentsEnabled: false,
        mcpContentWritesEnabled: false,
    });
    const refusal = await refusalFrom(
        service.assertOperation({
            ...operation,
            kind: 'tool_effect',
            key: 'createContent.sql_chart',
        }),
    );
    expect(refusal?.blockers?.map((blocker) => blocker.checkId)).toEqual([
        'agent_admission',
        'agent_enabled',
        'project_scope',
        'capability:content_write',
        'capability:raw_sql',
        'content_writes',
        'warehouse_confirmation',
    ]);
    expect(
        new Set(refusal?.blockers?.map((blocker) => blocker.checkId)).size,
    ).toBe(refusal?.blockers?.length);
    expect(JSON.stringify(refusal)).not.toMatch(
        /another-person|another-project|sourceAssignments|bindingFingerprint/,
    );
});

test('missing organization settings keep the existing enabled defaults', async () => {
    const { service, operation, deps, policy } = setup();
    deps.getOrganizationSettings.mockResolvedValue(null);
    policy.systemRoleMatrix.viewer = [
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
