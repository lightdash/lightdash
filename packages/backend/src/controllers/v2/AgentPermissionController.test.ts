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
            allowedProjectUuids: null,
            systemRoleMatrix: agentSystemRoleMatrix([]),
        }),
    (c: AgentPermissionController, req: Request) =>
        c.applyPilotPreset(req, { allowedProjectUuids: ['project'] }),
    (c: AgentPermissionController, req: Request) => c.resetToLegacy(req),
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
        allowedProjectUuids: [],
        systemRoleMatrix: matrix,
    });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({
            mode: 'managed',
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

test('the pilot replaces only the system-role matrix and project limit', async () => {
    const { controller, req, deps } = setup();
    await controller.applyPilotPreset(req, {
        allowedProjectUuids: ['project'],
    });
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith({
        organizationUuid: req.account!.organization.organizationUuid,
        updatedByUserUuid: req.account!.user.id,
        mode: 'managed',
        allowedProjectUuids: ['project'],
        systemRoleMatrix: agentSystemRoleMatrix([
            AgentCapability.ReadDiscover,
            AgentCapability.Query,
            AgentCapability.Export,
        ]),
    });
    expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();
});

test('reset preserves grants and project limits while restoring legacy mode', async () => {
    const { controller, req, deps } = setup();
    const policy = {
        mode: 'managed',
        version: 7,
        allowedProjectUuids: ['project'],
        systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
    };
    deps.agentCapabilityPolicyModel.get.mockResolvedValue(policy);
    await controller.resetToLegacy(req);
    expect(deps.agentCapabilityPolicyModel.save).toHaveBeenCalledWith(
        expect.objectContaining({ ...policy, mode: 'legacy' }),
    );
});
