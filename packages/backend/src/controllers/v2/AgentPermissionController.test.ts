import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    ForbiddenError,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request } from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import { createOAuthScopedAbility } from '../../auth/oauthScopes/scopedAbility';
import { AgentPermissionService } from '../../services/AgentPermissionService/AgentPermissionService';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../../services/AiAccessService/agentExecutionContext';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { AgentPermissionController } from './AgentPermissionController';

const setup = () => {
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const policy: AgentCapabilityPolicy = {
        version: 0,
        allowedCapabilities: null,
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
            save: vi.fn().mockResolvedValue(policy),
            getProjectPolicies: vi.fn().mockResolvedValue([]),
            saveProjectPolicy: vi.fn(),
            deleteProjectPolicy: vi.fn(),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
        },

        agentActionLogModel: { insert: vi.fn() },
    };
    const service = new AgentPermissionService(deps);
    const controller = new AgentPermissionController({
        getAgentPermissionService: () => service,
    } as ServiceRepository);
    const req = { account } as Request;
    return { controller, req, account, deps, service, policy };
};

const operations = [
    (c: AgentPermissionController, req: Request) => c.getPolicy(req),
    (c: AgentPermissionController, req: Request) =>
        c.saveCeiling(req, {
            version: 0,
            allowedGroupUuids: null,
        }),
    (c: AgentPermissionController, req: Request) =>
        c.resetPolicy(req, { version: 0 }),
    (c: AgentPermissionController, req: Request) => c.getProjectPolicies(req),
    (c: AgentPermissionController, req: Request) =>
        c.saveProjectPolicy(req, 'project', { allowedCapabilities: [] }),
    (c: AgentPermissionController, req: Request) =>
        c.deleteProjectPolicy(req, 'project'),
];

test.each(operations)('rejects non-admin callers', async (operation) => {
    const { controller, req, account, deps } = setup();
    account.user.ability = new Ability<PossibleAbilities>([]);
    await expect(operation(controller, req)).rejects.toBeInstanceOf(
        ForbiddenError,
    );
    expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
});

test.each(operations)(
    'rejects OAuth even with manage:all',
    async (operation) => {
        const { controller, req } = setup();
        req.account = {
            ...req.account!,
            authentication: {
                type: 'oauth',
                source: '',
                token: '',
                clientId: 'client',
                scopes: ['write'],
            },
        } as Request['account'];
        await expect(operation(controller, req)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
    },
);

test.each(operations)(
    'rejects an OAuth scope context on a session account',
    async (operation) => {
        const { controller, req, account } = setup();
        account.user.ability = createOAuthScopedAbility(account.user.ability, {
            scopes: ['write'],
            clientId: 'client',
            mode: 'log',
            getRequest: () => ({ method: null, routeTemplate: null }),
        });
        await expect(operation(controller, req)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
    },
);

test.each(operations)('rejects agent execution contexts', async (operation) => {
    const { controller, req, account } = setup();
    const context = createAgentExecutionContext({
        account,
        surface: AgentActorSurface.MCP,
        clientId: null,
        agentUuid: null,
        agentIdentityEnabled: true,
    });
    await expect(
        agentExecutionContext.run(context, () => operation(controller, req)),
    ).rejects.toBeInstanceOf(ForbiddenError);
});

test.each(operations)(
    'rejects when the org feature is disabled',
    async (operation) => {
        const { controller, req, deps } = setup();
        deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        await expect(operation(controller, req)).rejects.toMatchObject({
            name: 'FeatureNotEnabledError',
            statusCode: 403,
        });
    },
);

test('ignores old people and project fields instead of storing them', async () => {
    const { controller, req, deps } = setup();
    const oldBody = {
        version: 0,
        allowedUserUuids: ['excluded'],
        allowedProjectUuids: ['foreign'],
    };
    await controller.saveCeiling(req, oldBody);
    const [saved] = deps.agentCapabilityPolicyModel.save.mock.calls[0];
    expect(saved).not.toHaveProperty('allowedUserUuids');
    expect(saved).not.toHaveProperty('allowedProjectUuids');
    expect(saved.allowedCapabilities).toBeUndefined();
    expect(deps.projectModel.getSummary).not.toHaveBeenCalled();
});

test('a null capability list removes the restrictions', async () => {
    const { controller, req, deps } = setup();
    await controller.saveCeiling(req, { allowedCapabilities: null });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({ allowedCapabilities: null }),
    );
});

test.each([['invalid'], 'query'])(
    'rejects an invalid capability list %j',
    async (allowedCapabilities) => {
        const { controller, req, deps } = setup();
        await expect(
            controller.saveCeiling(req, {
                allowedCapabilities,
            } as never),
        ).rejects.toMatchObject({ name: 'ParameterError' });
        expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
    },
);

test.each([-1, 1.5, NaN])(
    'rejects invalid version %s on save and reset',
    async (version) => {
        const { controller, req } = setup();
        await expect(
            controller.saveCeiling(req, { version }),
        ).rejects.toMatchObject({ name: 'ParameterError' });
        await expect(
            controller.resetPolicy(req, { version }),
        ).rejects.toMatchObject({ name: 'ParameterError' });
    },
);

test('reset clears the capability list and omits groups without a role matrix', async () => {
    const { controller, req, deps } = setup();
    await controller.resetPolicy(req, { version: 7 });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({
            version: 7,
            allowedCapabilities: null,
            allowedGroupUuids: undefined,
        }),
    );
    const [saved] = deps.agentCapabilityPolicyModel.save.mock.calls[0];
    expect(saved).not.toHaveProperty('systemRoleMatrix');
    expect(deps.agentCapabilityPolicyModel.get).not.toHaveBeenCalled();
});

test('GET returns the saved policy without a role matrix or defaults', async () => {
    const { controller, req, deps } = setup();
    const { results } = await controller.getPolicy(req);
    expect(results).toMatchObject({ allowedCapabilities: null });
    expect(results).not.toHaveProperty('systemRoleMatrix');
    expect(results).not.toHaveProperty('defaults');
    expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
});

test('save accepts a legacy role matrix and does not store it', async () => {
    const { service, account, deps, policy } = setup();
    const allowedCapabilities = [AgentCapability.Query, AgentCapability.RawSql];
    const systemRoleMatrix = {
        [OrganizationMemberRole.MEMBER]: [],
        [OrganizationMemberRole.VIEWER]: [AgentCapability.Query],
        [OrganizationMemberRole.INTERACTIVE_VIEWER]: [AgentCapability.Query],
        [OrganizationMemberRole.EDITOR]: [
            AgentCapability.Query,
            AgentCapability.ContentWrite,
        ],
        [OrganizationMemberRole.DEVELOPER]: [
            AgentCapability.Query,
            AgentCapability.RawSql,
        ],
        [OrganizationMemberRole.ADMIN]: Object.values(AgentCapability),
    };
    const legacyCeiling = {
        allowedCapabilities,
        systemRoleMatrix,
    };
    await expect(service.saveCeiling(account, legacyCeiling)).resolves.toBe(
        policy,
    );
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledOnce();
    const [saved] = deps.agentCapabilityPolicyModel.save.mock.calls[0];
    expect(saved).not.toHaveProperty('systemRoleMatrix');
    expect(saved).not.toHaveProperty('mode');
    expect(saved).toMatchObject({ allowedCapabilities });
});

test.each([true, false])(
    'GET reports group availability %s and the saved restriction',
    async (available) => {
        const { controller, req, deps } = setup();
        deps.areGroupsAvailable.mockResolvedValue(available);
        deps.agentCapabilityPolicyModel.get.mockResolvedValue({
            version: 2,
            allowedGroupUuids: ['group'],
            allowedCapabilities: null,
        });
        expect((await controller.getPolicy(req)).results).toMatchObject({
            allowedGroupUuids: ['group'],
            groupsAvailable: available,
        });
        expect(deps.areGroupsAvailable).toHaveBeenCalledExactlyOnceWith(
            req.account!.organization.organizationUuid,
        );
    },
);

test('a PUT with only groups stores the group restriction and keeps the saved capability list', async () => {
    const { controller, req, deps } = setup();
    await controller.saveCeiling(req, {
        allowedGroupUuids: ['group'],
    });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({
            allowedCapabilities: undefined,
            allowedGroupUuids: ['group'],
        }),
    );
});

test('PUT rejects a new restriction when groups are unavailable but permits clearing and omission', async () => {
    const { controller, req, deps } = setup();
    deps.areGroupsAvailable.mockResolvedValue(false);
    await expect(
        controller.saveCeiling(req, { allowedGroupUuids: ['group'] }),
    ).rejects.toThrow('Groups are not available for this organization.');
    expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
    await controller.saveCeiling(req, { allowedGroupUuids: null });
    expect(
        deps.agentCapabilityPolicyModel.save.mock.calls[0][0].allowedGroupUuids,
    ).toBeNull();
    await controller.saveCeiling(req, {});
    expect(
        deps.agentCapabilityPolicyModel.save.mock.calls[1][0].allowedGroupUuids,
    ).toBeUndefined();
    expect(
        deps.agentCapabilityPolicyModel.save.mock.calls[1][0]
            .allowedCapabilities,
    ).toBeUndefined();
});

test('reset omits the group column so even an all-deleted restriction is preserved', async () => {
    const { controller, req, deps } = setup();
    deps.agentCapabilityPolicyModel.get.mockResolvedValue({
        version: 2,
        allowedGroupUuids: [],
        allowedCapabilities: Object.values(AgentCapability),
    });
    await controller.resetPolicy(req, { version: 2 });
    expect(
        deps.agentCapabilityPolicyModel.save.mock.calls[0][0].allowedGroupUuids,
    ).toBeUndefined();
});

test.each([
    'getWarehouseConfirmation',
    'confirmWarehouse',
    'deleteWarehouseConfirmation',
])('does not expose %s', (method) => {
    expect(AgentPermissionController.prototype).not.toHaveProperty(method);
});

describe('project restrictions', () => {
    test('saves a project list in capability order', async () => {
        const { controller, req, account, deps } = setup();
        deps.agentCapabilityPolicyModel.saveProjectPolicy.mockImplementation(
            async (policy) => policy,
        );
        await controller.saveProjectPolicy(req, 'project', {
            allowedCapabilities: [
                AgentCapability.Export,
                AgentCapability.Query,
            ],
        });
        expect(
            deps.agentCapabilityPolicyModel.saveProjectPolicy,
        ).toHaveBeenCalledWith({
            projectUuid: 'project',
            allowedCapabilities: [
                AgentCapability.Query,
                AgentCapability.Export,
            ],
            updatedByUserUuid: account.user.id,
        });
    });

    test('saves no restrictions for a project as null', async () => {
        const { controller, req, deps } = setup();
        await controller.saveProjectPolicy(req, 'project', {
            allowedCapabilities: null,
        });
        expect(
            deps.agentCapabilityPolicyModel.saveProjectPolicy,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ allowedCapabilities: null }),
        );
    });

    test('rejects an unknown capability', async () => {
        const { controller, req, deps } = setup();
        await expect(
            controller.saveProjectPolicy(req, 'project', {
                allowedCapabilities: ['everything' as AgentCapability],
            }),
        ).rejects.toThrow('Provide a valid capability list');
        expect(
            deps.agentCapabilityPolicyModel.saveProjectPolicy,
        ).not.toHaveBeenCalled();
    });

    test.each(['save', 'delete'] as const)(
        "cannot %s restrictions for another organization's project",
        async (action) => {
            const { controller, req, deps } = setup();
            deps.projectModel.getSummary.mockResolvedValue({
                organizationUuid: 'another-organization',
            });
            await expect(
                action === 'save'
                    ? controller.saveProjectPolicy(req, 'project', {
                          allowedCapabilities: [],
                      })
                    : controller.deleteProjectPolicy(req, 'project'),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(
                deps.agentCapabilityPolicyModel.saveProjectPolicy,
            ).not.toHaveBeenCalled();
            expect(
                deps.agentCapabilityPolicyModel.deleteProjectPolicy,
            ).not.toHaveBeenCalled();
        },
    );
});
