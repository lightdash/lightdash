import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AgentCapability,
    FeatureNotEnabledError,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    type AgentAccessPreviewRequest,
    type AgentCapabilityPolicy,
    type PossibleAbilities,
    type RegisteredAccount,
} from '@lightdash/common';
import { type Request } from 'express';
import { fromApiKey, fromOauth, fromSession } from '../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
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
        userModel: {
            getAgentRoleAssignments: vi.fn(),
            findSessionUserByUUIDInOrganization: vi.fn(),
        },
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
        controller.saveCeiling(req, {
            version: 0,
            allowedUserUuids: null,
            allowedProjectUuids: ['other-project'],
            systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
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

test('reset preserves grants and admission limits while restoring legacy mode', async () => {
    const { controller, req, deps } = setup();
    const policy = {
        mode: 'managed',
        version: 7,
        allowedUserUuids: ['allowed-user'],
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

test.each([null, [], ['allowed-user']])(
    'round-trips user admission %j through ceiling and GET',
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
            (await controller.getPolicy(req)).results.allowedUserUuids,
        ).toEqual(allowedUserUuids);
    },
);

test.each(['saveCeiling'] as const)(
    '%s passes an omitted people list through so the stored list is not rewritten',
    async (method) => {
        const { controller, req, deps } = setup();
        deps.agentCapabilityPolicyModel.get.mockResolvedValue({
            mode: 'managed',
            version: 3,
            allowedUserUuids: ['allowed-user'],
            allowedProjectUuids: null,
            systemRoleMatrix: agentSystemRoleMatrix([]),
        });
        await controller[method](req, {
            allowedProjectUuids: null,
            systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.Query]),
        });
        expect(
            deps.agentCapabilityPolicyModel.save.mock.calls[0][0]
                .allowedUserUuids,
        ).toBeUndefined();
    },
);

test('an explicit empty people list is kept, not replaced by the stored list', async () => {
    const { controller, req, deps } = setup();
    deps.agentCapabilityPolicyModel.get.mockResolvedValue({
        mode: 'managed',
        version: 3,
        allowedUserUuids: ['allowed-user'],
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

describe('access preview', () => {
    const setupPreview = () => {
        const admin = {
            ...defaultSessionUser,
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'all' },
            ]),
        };
        const person = {
            ...defaultSessionUser,
            userUuid: 'selected-person',
            ability: new Ability<PossibleAbilities>([]),
        };
        const caller = fromSession(admin);
        const policy: AgentCapabilityPolicy = {
            mode: 'managed',
            version: 7,
            allowedProjectUuids: null,
            allowedUserUuids: null,
            systemRoleMatrix: agentSystemRoleMatrix(
                Object.values(AgentCapability),
            ),
        };
        const deps = {
            resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
            isCustomRolesLicensed: vi.fn().mockReturnValue(true),
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            },
            agentCapabilityPolicyModel: {
                get: vi.fn().mockResolvedValue(policy),
                save: vi.fn(),
            },
            agentWarehouseRestrictionConfirmationModel: {
                get: vi.fn().mockResolvedValue(null),
                getCurrentBindingFingerprint: vi
                    .fn()
                    .mockResolvedValue('current'),
                upsert: vi.fn(),
                delete: vi.fn(),
            },
            userModel: {
                findSessionUserByUUIDInOrganization: vi
                    .fn()
                    .mockResolvedValue(person),
                getAgentRoleAssignments: vi.fn().mockResolvedValue({
                    systemRoles: [OrganizationMemberRole.VIEWER],
                    customRoles: [],
                }),
            },
            projectModel: {
                getSummary: vi.fn().mockResolvedValue({
                    organizationUuid: caller.organization.organizationUuid,
                }),
            },
            getOrganizationSettings: vi.fn().mockResolvedValue({
                mcpAgentsEnabled: true,
                mcpContentWritesEnabled: true,
            }),
            agentActionLogModel: { insert: vi.fn() },
        };
        const service = new AgentPermissionService(deps);
        const audit = vi.spyOn(service as never, 'createAuditedAbility');
        const controller = new AgentPermissionController({
            getAgentPermissionService: () => service,
        } as ServiceRepository);
        const request: AgentAccessPreviewRequest = {
            personUuid: person.userUuid,
            projectUuid: 'project',
            actionId: 'run_raw_sql',
        };
        const invoke = (account: RegisteredAccount = caller, body = request) =>
            controller.explain({ account } as Request, body);
        const expectNoWrites = () => {
            expect(audit).not.toHaveBeenCalled();
            expect(deps.agentCapabilityPolicyModel.save).not.toHaveBeenCalled();
            expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
            expect(
                deps.agentWarehouseRestrictionConfirmationModel.upsert,
            ).not.toHaveBeenCalled();
            expect(
                deps.agentWarehouseRestrictionConfirmationModel.delete,
            ).not.toHaveBeenCalled();
        };
        return {
            admin,
            person,
            caller,
            policy,
            deps,
            service,
            invoke,
            request,
            expectNoWrites,
        };
    };

    test.each(['session', 'pat'] as const)(
        'accepts an admin %s and checks the selected person',
        async (auth) => {
            const { admin, person, caller, invoke, deps, expectNoWrites } =
                setupPreview();
            const response = await invoke(
                auth === 'pat' ? fromApiKey(admin, 'token') : caller,
            );
            expect(response).toMatchObject({
                status: 'ok',
                results: {
                    actionId: 'run_raw_sql',
                    result: 'refused',
                    allowedByCheckedPermissionsOnly: false,
                },
            });
            expect(response.results.checks[0]).toMatchObject({
                kind: 'person_permission',
                status: 'refused',
            });
            expect(response.results.mainReason).toEqual(
                response.results.policyMainReason,
            );
            expect(
                deps.userModel.findSessionUserByUUIDInOrganization,
            ).toHaveBeenCalledWith(
                person.userUuid,
                caller.organization.organizationUuid,
            );
            expect(deps.userModel.getAgentRoleAssignments).toHaveBeenCalledWith(
                person.userUuid,
                caller.organization.organizationUuid,
                'project',
                true,
            );
            expectNoWrites();
        },
    );

    test.each(['legacy', 'managed'] as const)(
        'rejects non-human callers in %s mode',
        async (mode) => {
            const { admin, caller, policy, invoke, deps, expectNoWrites } =
                setupPreview();
            policy.mode = mode;
            await expect(
                invoke(
                    fromOauth(admin, {
                        accessToken: 'token',
                        client: { id: 'client' },
                    }),
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            const scoped = fromSession({
                ...admin,
                ability: createOAuthScopedAbility(admin.ability, {
                    mode: 'enforce',
                    scopes: ['read', 'write'],
                    clientId: 'client',
                    getRequest: () => ({ method: 'POST', routeTemplate: null }),
                }),
            });
            await expect(invoke(scoped)).rejects.toBeInstanceOf(ForbiddenError);
            const context = createAgentExecutionContext({
                account: caller,
                surface: AgentActorSurface.MCP,
                clientId: null,
                agentUuid: null,
                agentIdentityEnabled: false,
            });
            await expect(
                agentExecutionContext.run(context, () => invoke()),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(
                deps.userModel.findSessionUserByUUIDInOrganization,
            ).not.toHaveBeenCalled();
            expectNoWrites();
        },
    );

    test('rejects a non-admin with 403 before loading the subject', async () => {
        const { person, invoke, deps, expectNoWrites } = setupPreview();
        await expect(invoke(fromSession(person))).rejects.toMatchObject({
            statusCode: 403,
        });
        expect(
            deps.userModel.findSessionUserByUUIDInOrganization,
        ).not.toHaveBeenCalled();
        expectNoWrites();
    });

    test('uses the sibling feature-disabled error', async () => {
        const { deps, invoke, expectNoWrites } = setupPreview();
        deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
        await expect(invoke()).rejects.toBeInstanceOf(FeatureNotEnabledError);
        expect(
            deps.userModel.findSessionUserByUUIDInOrganization,
        ).not.toHaveBeenCalled();
        expectNoWrites();
    });

    test.each([
        'foreign person',
        'missing person',
        'foreign project',
        'missing project',
    ] as const)('does not disclose %s', async (failure) => {
        const { invoke, deps, expectNoWrites } = setupPreview();
        if (failure.endsWith('person'))
            deps.userModel.findSessionUserByUUIDInOrganization.mockRejectedValue(
                new NotFoundError('private person details'),
            );
        else if (failure === 'foreign project')
            deps.projectModel.getSummary.mockResolvedValue({
                organizationUuid: 'foreign',
            });
        else
            deps.projectModel.getSummary.mockRejectedValue(
                new NotFoundError('private project details'),
            );
        await expect(invoke()).rejects.toMatchObject({
            statusCode: 404,
            message: 'The selected person or project is not available.',
        });
        expect(deps.userModel.getAgentRoleAssignments).not.toHaveBeenCalled();
        expectNoWrites();
    });

    test('retains legacy mode and a person row without managed limits', async () => {
        const { policy, invoke, expectNoWrites } = setupPreview();
        policy.mode = 'legacy';
        const { results } = await invoke();
        expect(results).toMatchObject({
            mode: 'legacy',
            result: 'refused',
            requiredCapabilities: [],
            policyMainReason: null,
            mainReason: null,
            blockers: [],
        });
        expect(results.checks.map(({ kind }) => kind)).toEqual([
            'person_permission',
            'connection_grant',
            'warehouse_access',
        ]);
        expectNoWrites();
    });

    test('qualifies allowed results when resource permissions cannot be checked', async () => {
        const { invoke, request, expectNoWrites } = setupPreview();
        const { results } = await invoke(undefined, {
            ...request,
            actionId: 'create_edit_chart',
        });
        expect(results).toMatchObject({
            result: 'allowed',
            allowedByCheckedPermissionsOnly: true,
            mainReason: null,
        });
        expect(results.checks[0]).toMatchObject({ status: 'not_checked' });
        expectNoWrites();
    });
});
