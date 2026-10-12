import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromOauth } from '../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
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
        allowedCapabilities: null,
        allowedGroupUuids: null,
        systemRoleMatrix: { ...matrix, viewer: [AgentCapability.Query] },
    };
    const deps = {
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
        areGroupsAvailable: vi.fn().mockResolvedValue(true),
        isCustomRolesLicensed: vi.fn().mockReturnValue(true),
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
        else policy.mode = 'legacy';
        await expect(
            service.assertOperation({ ...operation, key: 'unknown' }),
        ).resolves.toBeUndefined();
        expect(deps.groupsModel.findUserInGroups).not.toHaveBeenCalled();
        expect(
            deps.agentCapabilityPolicyModel.getForEnforcement,
        ).toHaveBeenCalledTimes(mode === 'off' ? 0 : 1);
        expect(deps.projectModel.getSummary).not.toHaveBeenCalled();
        expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();

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

test('raw SQL is allowed with its role grant and no confirmation dependency', async () => {
    const { service, policy, deps, operation } = setup();
    policy.systemRoleMatrix.viewer = [AgentCapability.RawSql];
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
        const { service, policy, deps, operation } = setup();
        policy.systemRoleMatrix.viewer = [AgentCapability.ContentWrite];
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
                editableCustomRoleUuid: null,
            },
            {
                requiredCapabilities: null,
                projectUuid: null,
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
        test.each(['legacy', 'managed'] as const)(
            'ignores historical lists in %s',
            async (mode) => {
                const { service, policy, operation, deps } = setup();
                policy.mode = mode;
                policy.systemRoleMatrix.viewer = [AgentCapability.ReadDiscover];
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

test('a stale listed user cannot bypass current organization membership', async () => {
    const { service, policy, account, operation, deps } = setup();
    policy.allowedGroupUuids = null;
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
        const { service, operation, policy } = setup();
        const effect = { ...operation, kind: 'tool_effect' as const, key };
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
    ...Object.values(AgentCapability),
] as const;

const paritySetup = (scenario: (typeof parityCases)[number]) => {
    const fixture = setup();
    const { policy, deps, operation } = fixture;
    policy.systemRoleMatrix.viewer = Object.values(AgentCapability);
    operation.key = 'SchedulerController.post';
    if (scenario === 'off')
        deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    if (scenario === 'legacy') policy.mode = 'legacy';
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

test('collects missing delivery capabilities in order', async () => {
    const { service, operation, policy, deps } = setup();
    policy.systemRoleMatrix.viewer = [];

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

test.each([false, true])(
    'non-primary custom-role diagnostics require organization management: %s',
    async (admin) => {
        const { service, operation, account, policy } = setup();
        policy.allowedGroupUuids = [];
        account.user.ability = new Ability<PossibleAbilities>(
            admin
                ? [{ action: 'manage', subject: 'all' }]
                : [{ action: 'view', subject: 'Project' }],
        );
        const resolved = await service.resolvePolicy(operation);
        vi.spyOn(
            service as unknown as {
                resolveManagedPolicy: AgentPermissionService['resolvePolicy'];
            },
            'resolveManagedPolicy',
        ).mockResolvedValue({
            ...resolved,
            editableCustomRoleUuid: 'custom-role',
        });
        const audited = vi.spyOn(service as never, 'createAuditedAbility');
        const refusal = await refusalFrom(service.assertOperation(operation));
        expect(
            refusal?.blockers?.find(
                (blocker) => blocker.checkId === 'capability:raw_sql',
            ),
        ).toMatchObject({
            settingsUrl: admin
                ? '/generalSettings/customRoles/custom-role'
                : '/generalSettings/agentIdentity',
        });
        expect(refusal?.explanationUrl).toBe(
            '/generalSettings/myAgentConnections',
        );
        expect(audited).not.toHaveBeenCalled();
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

test('runtime sanitization preserves primary custom-role links', async () => {
    const { service, operation, account } = setup();
    account.user.ability = new Ability<PossibleAbilities>([]);
    const resolved = await service.resolvePolicy(operation);
    vi.spyOn(
        service as unknown as {
            resolveManagedPolicy: AgentPermissionService['resolvePolicy'];
        },
        'resolveManagedPolicy',
    ).mockResolvedValue({
        ...resolved,
        editableCustomRoleUuid: 'custom-role',
    });
    const refusal = await refusalFrom(service.assertOperation(operation));
    expect(refusal?.settingsUrl).toBe(
        '/generalSettings/customRoles/custom-role',
    );
    expect(refusal?.blockers?.[0].settingsUrl).toBe(refusal?.settingsUrl);
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
        expect(deps.userModel.getAgentRoleAssignments).toHaveBeenCalledTimes(
            managed ? 1 : 0,
        );
        expect(deps.projectModel.getSummary).toHaveBeenCalledTimes(
            managed ? 1 : 0,
        );
    },
);

test('raw SQL with its role grant only reads the remaining policy inputs', async () => {
    const { service, operation, deps, policy } = setup();
    policy.systemRoleMatrix.viewer = [AgentCapability.RawSql];
    await expect(service.assertOperation(operation)).resolves.toBeUndefined();
    expect(deps.featureFlagModel.get).toHaveBeenCalledTimes(1);
    expect(
        deps.agentCapabilityPolicyModel.getForEnforcement,
    ).toHaveBeenCalledTimes(1);
    expect(
        deps.userModel.getAgentRoleAssignments,
    ).toHaveBeenCalledExactlyOnceWith(
        operation.account.user.id,
        operation.organizationUuid,
        operation.projectUuid,
    );

    expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
});

test('all independent blockers are ordered and disclose no role sources or project lists', async () => {
    const { service, operation, deps, policy } = setup();
    policy.allowedGroupUuids = ['another-group'];

    policy.systemRoleMatrix.viewer = [];

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
    const { service, operation, deps, policy } = setup();
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

test.each([true, false])(
    'legacy group admission checks membership once (member %s)',
    async (member) => {
        const { service, deps, operation, policy } = setup();
        policy.mode = 'legacy';
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
        expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();
        expect(deps.projectModel.getSummary).not.toHaveBeenCalled();

        expect(deps.areGroupsAvailable).not.toHaveBeenCalled();
    },
);

test('an all-deleted group restriction refuses without a membership query', async () => {
    const { service, deps, operation, policy } = setup();
    policy.mode = 'legacy';
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
        policy.mode = mode;
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
        expect(deps.userModel.getAgentRoleAssignments).toHaveBeenCalledOnce();
    },
);

test('legacy restriction requires a verified actor and records the refusal', async () => {
    const { service, deps, operation, policy } = setup();
    policy.mode = 'legacy';
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
        h.policy.mode = mode === 'off' ? 'managed' : mode;
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
        expect(h.deps.userModel.getAgentRoleAssignments).toHaveBeenCalledTimes(
            managed,
        );
        expect(h.deps.projectModel.getSummary).toHaveBeenCalledTimes(managed);

        expect(h.deps.areGroupsAvailable).not.toHaveBeenCalled();
    },
);

describe('organization capability list', () => {
    test('cuts custom role grants and records the organization remedy', async () => {
        const { service, policy, deps, operation } = setup();
        Object.assign(policy, { allowedCapabilities: [AgentCapability.Query] });
        deps.userModel.getAgentRoleAssignments.mockResolvedValue({
            systemRoles: [],
            customRoles: [{ roleUuid: 'custom', scopes: ['view:AgentRawSql'] }],
        });
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
    test('preserves a custom grant with a historical null list', async () => {
        const { service, policy, deps, operation } = setup();
        Object.assign(policy, { allowedCapabilities: null });
        deps.userModel.getAgentRoleAssignments.mockResolvedValue({
            systemRoles: [],
            customRoles: [{ roleUuid: 'custom', scopes: ['view:AgentRawSql'] }],
        });
        await expect(
            service.assertOperation(operation),
        ).resolves.toBeUndefined();
    });
    test('all eleven organization capabilities do not expand a custom-only role', async () => {
        const { service, policy, deps, operation, account } = setup();
        account.user.ability = new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'all' },
        ]);
        Object.assign(policy, {
            allowedCapabilities: Object.values(AgentCapability),
        });
        deps.userModel.getAgentRoleAssignments.mockResolvedValue({
            systemRoles: [],
            customRoles: [
                {
                    roleUuid: 'custom',
                    scopes: [
                        'view:AgentReadDiscover',
                        'view:AgentQuery',
                        'view:AgentExport',
                        'view:AgentRawSql',
                    ],
                },
            ],
        });
        await Promise.all(
            [
                AgentCapability.ReadDiscover,
                AgentCapability.Query,
                AgentCapability.Export,
                AgentCapability.RawSql,
            ].map((capability) =>
                expect(
                    service.assertOperation({
                        ...operation,
                        kind: 'capability',
                        key: capability,
                    }),
                ).resolves.toBeUndefined(),
            ),
        );
        await expect(
            service.assertOperation({
                ...operation,
                kind: 'capability',
                key: AgentCapability.ContentWrite,
            }),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                policyLayer: 'org_ceiling',
                settingsUrl: '/generalSettings/customRoles/custom',
            },
        });
    });
    test.each(Object.values(AgentActorSurface))(
        'an empty list refuses turns on %s including custom roles',
        async (surface) => {
            const { service, policy, deps, operation } = setup();
            Object.assign(policy, { allowedCapabilities: [] });
            deps.userModel.getAgentRoleAssignments.mockResolvedValue({
                systemRoles: [],
                customRoles: [
                    { roleUuid: 'custom', scopes: ['view:AgentQuery'] },
                ],
            });
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
