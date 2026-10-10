import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    FeatureFlags,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
    type PossibleAbilities,
} from '@lightdash/common';
import { buildAccount } from '../../auth/account/account.mock';
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
            key: 'SpaceController.createSpace',
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
                    settingsUrl: '/generalSettings/agentIdentity',
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
