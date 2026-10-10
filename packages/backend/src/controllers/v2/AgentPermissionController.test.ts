import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    ForbiddenError,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request } from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import { createOAuthScopedAbility } from '../../auth/oauthScopes/scopedAbility';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../services/AgentPermissionService/AgentPermissionService';
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
    const policy = {
        mode: 'legacy' as const,
        version: 0,
        allowedUserUuids: null,
        allowedProjectUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([]),
    };
    const deps = {
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        isCustomRolesLicensed: vi.fn().mockReturnValue(true),
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            save: vi.fn().mockResolvedValue(policy),
        },
        agentWarehouseRestrictionConfirmationModel: {
            get: vi.fn().mockResolvedValue(null),
            upsert: vi.fn(),
            delete: vi.fn(),
            getCurrentBindingFingerprint: vi.fn().mockResolvedValue('binding'),
        },
        userModel: { getAgentRoleAssignments: vi.fn() },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: account.organization.organizationUuid,
            }),
        },
        getOrganizationSettings: vi.fn(),
        agentActionLogModel: { insert: vi.fn() },
    };
    const service = new AgentPermissionService(deps);
    const controller = new AgentPermissionController({
        getAgentPermissionService: () => service,
    } as ServiceRepository);
    const req = { account } as Request;
    return { controller, req, account, deps };
};

const operations = [
    (c: AgentPermissionController, req: Request) => c.getPolicy(req),
    (c: AgentPermissionController, req: Request) =>
        c.saveCeiling(req, {
            version: 0,
            allowedUserUuids: null,
            allowedProjectUuids: null,
            systemRoleMatrix: agentSystemRoleMatrix([]),
        }),
    (c: AgentPermissionController, req: Request) =>
        c.applyPilotPreset(req, {
            version: 0,
            allowedProjectUuids: ['project'],
            allowedUserUuids: null,
        }),
    (c: AgentPermissionController, req: Request) =>
        c.resetToLegacy(req, { version: 0 }),
    (c: AgentPermissionController, req: Request) =>
        c.getWarehouseConfirmation(req, 'project'),
    (c: AgentPermissionController, req: Request) =>
        c.confirmWarehouse(req, 'project'),
    (c: AgentPermissionController, req: Request) =>
        c.deleteWarehouseConfirmation(req, 'project'),
];

test.each(operations)('rejects non-admin callers', async (operation) => {
    const { controller, req, account, deps } = setup();
    account.user.ability = new Ability<PossibleAbilities>([]);
    await expect(operation(controller, req)).rejects.toBeInstanceOf(
        ForbiddenError,
    );
    expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
    expect(
        deps.agentWarehouseRestrictionConfirmationModel.upsert,
    ).not.toHaveBeenCalled();
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

test('saves the full ceiling as managed and preserves an empty project list', async () => {
    const { controller, req, deps } = setup();
    const matrix = agentSystemRoleMatrix([AgentCapability.Query]);
    await controller.saveCeiling(req, {
        version: 0,
        allowedUserUuids: null,
        allowedProjectUuids: [],
        systemRoleMatrix: matrix,
    });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({
            mode: 'managed',
            allowedUserUuids: null,
            allowedProjectUuids: [],
            systemRoleMatrix: matrix,
        }),
    );
});

test('rejects cross-org policy projects and confirmation projects', async () => {
    const { controller, req, deps } = setup();
    deps.projectModel.getSummary.mockResolvedValue({
        organizationUuid: 'other',
    });
    await expect(
        controller.applyPilotPreset(req, {
            version: 0,
            allowedUserUuids: null,
            allowedProjectUuids: ['other-project'],
        }),
    ).rejects.toMatchObject({ name: 'ParameterError' });
    await expect(
        controller.confirmWarehouse(req, 'other-project'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
    expect(
        deps.agentWarehouseRestrictionConfirmationModel.upsert,
    ).not.toHaveBeenCalled();
});

test('confirmation stores the current fingerprint and reads report stale bindings', async () => {
    const { controller, req, deps } = setup();
    await controller.confirmWarehouse(req, 'project');
    expect(
        deps.agentWarehouseRestrictionConfirmationModel.upsert,
    ).toHaveBeenCalledWith({
        projectUuid: 'project',
        bindingFingerprint: 'binding',
        confirmedByUserUuid: req.account!.user.id,
    });
    deps.agentWarehouseRestrictionConfirmationModel.get.mockResolvedValue({
        bindingFingerprint: 'old',
    });
    expect(
        (await controller.getWarehouseConfirmation(req, 'project')).results
            .confirmed,
    ).toBe(false);
});

test('a project connection admin can confirm without organization admin rights', async () => {
    const { controller, req, account, deps } = setup();
    account.user.ability = new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'Project',
            conditions: {
                organizationUuid: account.organization.organizationUuid,
                projectUuid: 'project',
            },
        },
    ]);
    await expect(
        controller.confirmWarehouse(req, 'project'),
    ).resolves.toMatchObject({ status: 'ok' });
    await expect(controller.getPolicy(req)).rejects.toBeInstanceOf(
        ForbiddenError,
    );
    expect(
        deps.agentWarehouseRestrictionConfirmationModel.upsert,
    ).toHaveBeenCalledOnce();
});

test('the pilot replaces the system-role matrix and admission limits', async () => {
    const { controller, req, deps } = setup();
    await controller.applyPilotPreset(req, {
        version: 0,
        allowedUserUuids: null,
        allowedProjectUuids: ['project'],
    });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith({
        version: 0,
        organizationUuid: req.account!.organization.organizationUuid,
        updatedByUserUuid: req.account!.user.id,
        mode: 'managed',
        allowedUserUuids: null,
        allowedProjectUuids: ['project'],
        systemRoleMatrix: agentSystemRoleMatrix([
            AgentCapability.ReadDiscover,
            AgentCapability.Query,
            AgentCapability.Export,
        ]),
    });
    expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();
});

test('reset preserves grants and admission limits while restoring legacy mode', async () => {
    const { controller, req, deps } = setup();
    const policy = {
        mode: 'managed',
        version: 7,
        allowedUserUuids: ['pilot-user'],
        allowedProjectUuids: ['project'],
        systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
    };
    deps.agentCapabilityPolicyModel.get.mockResolvedValue(policy);
    await controller.resetToLegacy(req, { version: 7 });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({ ...policy, mode: 'legacy' }),
    );
});

test('reset passes the requested version instead of adopting a newer saved version', async () => {
    const { controller, req, deps } = setup();
    deps.agentCapabilityPolicyModel.get.mockResolvedValue({
        mode: 'managed',
        version: 8,
        allowedUserUuids: [],
        allowedProjectUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([]),
    });
    await controller.resetToLegacy(req, { version: 7 });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({ version: 7, mode: 'legacy' }),
    );
});

test.each([null, [], ['pilot-user']])(
    'round-trips user admission %j through ceiling, preset and GET',
    async (allowedUserUuids) => {
        const { controller, req, deps } = setup();
        deps.agentCapabilityPolicyModel.save.mockImplementation(
            async (policy) => {
                const saved = { ...policy, version: 2 };
                deps.agentCapabilityPolicyModel.get.mockResolvedValue(saved);
                return saved;
            },
        );
        const ceiling = {
            version: 0,
            allowedProjectUuids: ['project'],
            allowedUserUuids,
            systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
        };
        expect(
            (await controller.saveCeiling(req, ceiling)).results,
        ).toMatchObject({ ...ceiling, version: 2 });
        expect((await controller.getPolicy(req)).results).toMatchObject({
            ...ceiling,
            version: 2,
        });
        expect(
            (
                await controller.applyPilotPreset(req, {
                    version: 0,
                    allowedProjectUuids: ['project'],
                    allowedUserUuids,
                })
            ).results,
        ).toMatchObject({ allowedUserUuids, allowedProjectUuids: ['project'] });
        expect(
            (await controller.getPolicy(req)).results.allowedUserUuids,
        ).toEqual(allowedUserUuids);
    },
);

test.each(['saveCeiling', 'applyPilotPreset'] as const)(
    '%s keeps the stored pilot users when an older payload omits them',
    async (method) => {
        const { controller, req, deps } = setup();
        deps.agentCapabilityPolicyModel.get.mockResolvedValue({
            mode: 'managed',
            version: 3,
            allowedUserUuids: ['pilot-user'],
            allowedProjectUuids: null,
            systemRoleMatrix: agentSystemRoleMatrix([]),
        });
        if (method === 'saveCeiling') {
            await controller.saveCeiling(req, {
                allowedProjectUuids: null,
                systemRoleMatrix: agentSystemRoleMatrix([
                    AgentCapability.Query,
                ]),
            });
        } else {
            await controller.applyPilotPreset(req, {
                allowedProjectUuids: null,
            });
        }
        expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
            expect.objectContaining({ allowedUserUuids: ['pilot-user'] }),
        );
    },
);

test('an explicit empty pilot list is kept, not replaced by the stored list', async () => {
    const { controller, req, deps } = setup();
    deps.agentCapabilityPolicyModel.get.mockResolvedValue({
        mode: 'managed',
        version: 3,
        allowedUserUuids: ['pilot-user'],
        allowedProjectUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([]),
    });
    await controller.saveCeiling(req, {
        allowedUserUuids: [],
        allowedProjectUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
    });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({ allowedUserUuids: [] }),
    );
});
