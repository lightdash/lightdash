import { Ability } from '@casl/ability';
import {
    AGENT_PILOT_CAPABILITIES,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request, type RequestHandler, type Response } from 'express';
import passport from 'passport';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import { lightdashConfig } from '../../config/lightdashConfig';
import { authenticateServiceAccount } from '../../ee/authentication';
import { errorHandler } from '../../errors';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../services/AgentPermissionService/AgentPermissionService';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { SpaceService } from '../../services/SpaceService/SpaceService';
import { SpaceController } from '../spaceController';
import {
    allowApiKeyAuthentication,
    allowOauthAuthentication,
} from './middlewares';

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));

const setup = ({
    mode = 'managed',
    operation = 'ProjectController_createDashboard',
    authentication = 'oauth',
    scopes = ['write'],
    projectUuid = 'project',
    allowedProjectUuids = null,
    allowedUserUuids = null,
}: {
    mode?: 'off' | 'legacy' | 'managed';
    operation?: string;
    authentication?: 'oauth' | 'pat' | 'session';
    scopes?: string[];
    projectUuid?: string | null;
    allowedProjectUuids?: string[] | null;
    allowedUserUuids?: string[] | null;
} = {}) => {
    const ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const user = {
        ...defaultSessionUser,
        ability,
        abilityRules: ability.rules,
    };
    const getPolicy = vi.fn().mockResolvedValue({
        mode: mode === 'managed' ? 'managed' : 'legacy',
        version: 1,
        allowedProjectUuids,
        allowedUserUuids,
        systemRoleMatrix: agentSystemRoleMatrix(AGENT_PILOT_CAPABILITIES),
    });
    const resolveResourceProjectUuid = vi.fn().mockResolvedValue(null);
    const service = new AgentPermissionService({
        resolveResourceProjectUuid,
        isCustomRolesLicensed: () => false,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: mode !== 'off' }),
        },
        agentCapabilityPolicyModel: { get: getPolicy, save: vi.fn() },
        agentWarehouseRestrictionConfirmationModel: {
            get: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            getCurrentBindingFingerprint: vi.fn(),
        },
        userModel: {
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.ADMIN],
                customRoles: [],
            }),
        },
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: user.organizationUuid }),
        },
        getOrganizationSettings: vi.fn().mockResolvedValue({
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
        }),
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
    });
    const assertOperation = vi.spyOn(service, 'assertOperation');
    const handler = Object.defineProperty(vi.fn(), 'name', {
        value: operation,
    });
    const request = {
        method: 'POST',
        headers: {
            authorization:
                authentication === 'pat' ? 'ApiKey token' : 'Bearer token',
        },
        query: {},
        body: {},
        baseUrl: '',
        originalUrl: '/api/v1/projects/project/dashboards',
        params: projectUuid === null ? {} : { projectUuid },
        route: {
            path: '/api/v1/projects/:projectUuid/dashboards',
            stack: [{ handle: handler }],
        },
        isAuthenticated: () => authentication === 'session',
        ...(authentication === 'session'
            ? { user, account: fromSession(user) }
            : {}),
        services: {
            getOauthService: () => ({
                authenticate: async () => {
                    if (authentication !== 'oauth')
                        throw new Error('Not OAuth');
                    return {
                        accessToken: 'token',
                        scope: scopes,
                        client: { id: 'client' },
                        user,
                    };
                },
            }),
            getUserService: () => ({ findSessionUser: async () => user }),
            getFeatureFlagService: () => ({
                get: async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.AgentIdentity
                            ? mode !== 'off'
                            : true,
                }),
            }),
            getAgentPermissionService: () => service,
        },
    } as unknown as Request;
    lightdashConfig.auth.pat.enabled = true;
    vi.mocked(authenticateServiceAccount).mockImplementation(
        (_req, _res, next) => next(),
    );
    vi.mocked(passport.authenticate).mockReturnValue(
        (req: Request, _res: Response, next: Parameters<RequestHandler>[2]) => {
            req.user = user;
            next();
        },
    );
    const run = (middleware: RequestHandler) =>
        new Promise<unknown>((resolve) => {
            middleware(request, {} as Response, (error?: unknown) =>
                resolve(error),
            );
        });
    return {
        request,
        run,
        assertOperation,
        getPolicy,
        resolveResourceProjectUuid,
    };
};

beforeEach(() => vi.clearAllMocks());

describe.each([
    { name: 'OAuth-only', middleware: allowOauthAuthentication },
    { name: 'API-key OAuth', middleware: allowApiKeyAuthentication },
])('$name agent policy', ({ middleware }) => {
    it('refuses content writes for a managed pilot and preserves typed 403 data', async () => {
        const { run, assertOperation } = setup();
        const error = await run(middleware);
        expect(error).toBeInstanceOf(AiAccessRefusedError);
        const message =
            "Your organization's agent permissions do not allow Create and edit content. Ask an admin to change Permissions on the Agents page.";
        expect(errorHandler(error as Error)).toMatchObject({
            statusCode: 403,
            message,
            data: {
                message,
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                capability: AgentCapability.ContentWrite,
                operation: 'ProjectController.createDashboard',
                projectUuid: 'project',
            },
        });
        expect(assertOperation).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'rest_operation',
                projectUuid: 'project',
                key: 'ProjectController.createDashboard',
            }),
        );
        expect(assertOperation.mock.calls[0][0].surface).toBe('api');
        expect(passport.authenticate).not.toHaveBeenCalled();
        expect(authenticateServiceAccount).not.toHaveBeenCalled();
    });
    it.each(['off', 'legacy'] as const)(
        'preserves content writes in %s mode',
        async (mode) => {
            const { run } = setup({ mode });
            await expect(run(middleware)).resolves.toBeUndefined();
        },
    );
    it.each(['off', 'legacy', 'managed'] as const)(
        'denies an unmapped route only in managed mode: %s',
        async (mode) => {
            const { run } = setup({
                mode,
                operation: 'NewController_unreviewed',
            });
            const error = await run(middleware);
            if (mode === 'managed')
                expect(error).toMatchObject({
                    statusCode: 403,
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED,
                    },
                });
            else expect(error).toBeUndefined();
        },
    );
    it('checks unchecked OAuth scopes before the agent gate', async () => {
        const { run, assertOperation } = setup({ scopes: ['read'] });
        expect(await run(middleware)).toBeInstanceOf(ForbiddenError);
        expect(assertOperation).not.toHaveBeenCalled();
    });
    it('passes null when the route has no project path parameter', async () => {
        const { run, assertOperation } = setup({
            operation: 'OrganizationController_getProjects',
            projectUuid: null,
        });
        await expect(run(middleware)).resolves.toBeUndefined();
        expect(assertOperation).toHaveBeenCalledWith(
            expect.objectContaining({ projectUuid: null }),
        );
    });
    it('allows a managed pilot query in its permitted project', async () => {
        const { run } = setup({
            operation: 'QueryController_executeAsyncMetricQuery',
            allowedProjectUuids: ['project'],
        });
        await expect(run(middleware)).resolves.toBeUndefined();
    });
    it.each(['another-project', null])(
        'refuses an unresolved or excluded query project: %s',
        async (projectUuid) => {
            const { request, run } = setup({
                operation: 'QueryController_executeAsyncMetricQuery',
                projectUuid,
                allowedProjectUuids: ['project'],
            });
            request.body = { projectUuid: 'project' };
            request.query = { projectUuid: 'project' };
            expect(await run(middleware)).toMatchObject({
                statusCode: 403,
                refusal: { reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED },
            });
        },
    );
    it.each([
        ['dashboardUuid', 'dashboard'],
        ['dashboardUuidOrSlug', 'dashboard'],
        ['chartUuid', 'saved_chart'],
        ['savedQueryUuid', 'saved_chart'],
        ['savedQueryUuidOrSlug', 'saved_chart'],
        ['spaceUuid', 'space'],
        ['queryUuid', 'query'],
    ])(
        'resolves a managed resource project from %s',
        async (parameter, type) => {
            const {
                request,
                run,
                assertOperation,
                resolveResourceProjectUuid,
            } = setup({
                operation: 'QueryController_executeAsyncMetricQuery',
                projectUuid: null,
                allowedProjectUuids: ['project'],
            });
            const uuid = 'ae9b5604-df2a-47bb-b04f-85822df26f7d';
            request.params[parameter] = uuid;
            resolveResourceProjectUuid.mockResolvedValue('project');
            await expect(run(middleware)).resolves.toBeUndefined();
            expect(resolveResourceProjectUuid).toHaveBeenCalledExactlyOnceWith({
                type,
                uuid,
            });
            expect(assertOperation.mock.calls[0][0].projectUuid).toBe(
                'project',
            );
        },
    );
    it.each(['off', 'legacy'] as const)(
        'skips a failing resource lookup in %s mode',
        async (mode) => {
            const { request, run, resolveResourceProjectUuid } = setup({
                mode,
                projectUuid: null,
            });
            request.params.dashboardUuid =
                'ae9b5604-df2a-47bb-b04f-85822df26f7d';
            resolveResourceProjectUuid.mockRejectedValue(
                new Error('Resource unavailable'),
            );
            await expect(run(middleware)).resolves.toBeUndefined();
            expect(resolveResourceProjectUuid).not.toHaveBeenCalled();
        },
    );
    it('refuses an unmapped operation without looking up its resource', async () => {
        const { request, run, resolveResourceProjectUuid } = setup({
            operation: 'NewController_unknown',
            projectUuid: null,
        });
        request.params.dashboardUuid = 'ae9b5604-df2a-47bb-b04f-85822df26f7d';
        resolveResourceProjectUuid.mockRejectedValue(
            new Error('Resource unavailable'),
        );
        expect(await run(middleware)).toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED },
        });
        expect(resolveResourceProjectUuid).not.toHaveBeenCalled();
    });
    it('fails closed when a managed resource lookup fails', async () => {
        const { request, run, resolveResourceProjectUuid, assertOperation } =
            setup({ projectUuid: null });
        request.params.dashboardUuid = 'ae9b5604-df2a-47bb-b04f-85822df26f7d';
        const failure = new Error('Resource unavailable');
        resolveResourceProjectUuid.mockRejectedValue(failure);
        expect(await run(middleware)).toBe(failure);
        expect(assertOperation).not.toHaveBeenCalled();
    });
    it('refuses an unresolved resource project when the policy limits projects', async () => {
        const { request, run, assertOperation } = setup({
            operation: 'QueryController_executeAsyncMetricQuery',
            projectUuid: null,
            allowedProjectUuids: ['project'],
        });
        request.params.queryUuid = 'ae9b5604-df2a-47bb-b04f-85822df26f7d';
        expect(await run(middleware)).toMatchObject({
            statusCode: 403,
            refusal: { reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED },
        });
        expect(assertOperation.mock.calls[0][0].projectUuid).toBeNull();
    });
    it('does not send a slug to UUID resource lookup', async () => {
        const { request, run, resolveResourceProjectUuid, assertOperation } =
            setup({ projectUuid: null });
        request.params.dashboardUuidOrSlug = 'dashboard-slug';
        expect(await run(middleware)).toBeInstanceOf(AiAccessRefusedError);
        expect(resolveResourceProjectUuid).not.toHaveBeenCalled();
        expect(assertOperation.mock.calls[0][0].projectUuid).toBeNull();
    });
    it('prefers the project path over a resource lookup', async () => {
        const { request, run, resolveResourceProjectUuid } = setup({
            operation: 'QueryController_executeAsyncMetricQuery',
        });
        request.params.dashboardUuid = 'ae9b5604-df2a-47bb-b04f-85822df26f7d';
        await expect(run(middleware)).resolves.toBeUndefined();
        expect(resolveResourceProjectUuid).not.toHaveBeenCalled();
    });
    it('leaves MCP requests to the per-tool gate', async () => {
        const { request, run, assertOperation } = setup();
        request.baseUrl = '/api/v1/mcp';
        await expect(run(middleware)).resolves.toBeUndefined();
        expect(assertOperation).not.toHaveBeenCalled();
    });
    it('uses a route scope guard for a handwritten route', async () => {
        const { request, run, assertOperation } = setup({
            operation: 'anonymous',
        });
        request.route.stack.unshift({
            handle: requireOAuthScopeOperation(
                'ProjectController.createDashboard',
            ),
        });
        expect(await run(middleware)).toBeInstanceOf(AiAccessRefusedError);
        expect(assertOperation).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'ProjectController.createDashboard',
            }),
        );
    });
});

it.each(['pat', 'session'] as const)(
    'leaves %s outside the agent policy',
    async (authentication) => {
        const { run, assertOperation, getPolicy } = setup({
            authentication,
            allowedUserUuids: [],
        });
        await expect(run(allowApiKeyAuthentication)).resolves.toBeUndefined();
        expect(assertOperation).not.toHaveBeenCalled();
        expect(getPolicy).not.toHaveBeenCalled();
    },
);

it.each([
    'InviteLinksController_createInviteLink',
    'ProjectController_updateProjectAccessForUser',
    'GroupsController_addUserToGroup',
    'OrganizationController_updateOrganizationMember',
])(
    'refuses managed OAuth self-grants through %s even with administration and publish',
    async (operation) => {
        const { run, getPolicy, request } = setup({
            operation,
            scopes: ['write'],
        });
        request.method = 'PATCH';
        request.body = { role: 'developer' };
        getPolicy.mockResolvedValue({
            mode: 'managed',
            version: 1,
            allowedProjectUuids: null,
            allowedUserUuids: null,
            systemRoleMatrix: agentSystemRoleMatrix([
                AgentCapability.Administration,
                AgentCapability.Publish,
            ]),
        });
        await expect(run(allowApiKeyAuthentication)).resolves.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                capability: AgentCapability.Administration,
                settingsUrl: '/generalSettings/agentIdentity',
            },
        });
    },
);
it.each(['off', 'legacy', 'pat', 'session'] as const)(
    'preserves %s membership REST writes',
    async (mode) => {
        const { run } = setup({
            operation: 'ProjectController_updateProjectAccessForUser',
            mode: mode === 'off' || mode === 'legacy' ? mode : 'managed',
            authentication:
                mode === 'pat' || mode === 'session' ? mode : 'oauth',
            scopes: ['write'],
        });
        await expect(run(allowApiKeyAuthentication)).resolves.toBeUndefined();
    },
);

it.each(['off', 'legacy', 'pat', 'session'] as const)(
    'preserves %s invite REST writes',
    async (mode) => {
        const { run } = setup({
            operation: 'InviteLinksController_createInviteLink',
            mode: mode === 'off' || mode === 'legacy' ? mode : 'managed',
            authentication:
                mode === 'pat' || mode === 'session' ? mode : 'oauth',
        });
        await expect(run(allowApiKeyAuthentication)).resolves.toBeUndefined();
    },
);

it('allows managed OAuth space metadata edits with content_write', async () => {
    const { run, getPolicy } = setup({
        operation: 'SpaceController_updateSpace',
    });
    getPolicy.mockResolvedValue({
        mode: 'managed',
        version: 1,
        allowedProjectUuids: null,
        allowedUserUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.ContentWrite]),
    });
    await expect(run(allowApiKeyAuthentication)).resolves.toBeUndefined();
});

it('checks access changes after allowing the OAuth space REST operation', async () => {
    const { run, request, getPolicy } = setup({
        operation: 'SpaceController_updateSpace',
    });
    const policy = {
        mode: 'managed' as const,
        version: 1,
        allowedProjectUuids: null,
        allowedUserUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([AgentCapability.ContentWrite]),
    };
    getPolicy.mockResolvedValue(policy);
    const policyRead = vi
        .spyOn(AgentCapabilityPolicyModel.prototype, 'get')
        .mockResolvedValue(policy);
    const space = {
        organizationUuid: defaultSessionUser.organizationUuid,
        projectUuid: 'project',
        uuid: 'space',
        name: 'Original',
        inheritParentPermissions: false,
        projectMemberAccessRole: null,
    };
    const spaceModel = {
        getSpaceSummary: vi.fn().mockResolvedValue(space),
        update: vi.fn(),
        updateWithCopiedPermissions: vi.fn(),
    };
    const service = new SpaceService({
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        analytics: { track: vi.fn() },
        spaceModel,
        spacePermissionService: {
            can: vi.fn().mockResolvedValue(true),
            getRawDirectAccess: vi.fn().mockResolvedValue({}),
        },
    } as unknown as ConstructorParameters<typeof SpaceService>[0]);
    const assemble = vi
        .spyOn(
            service as unknown as { assembleFullSpace: () => Promise<unknown> },
            'assembleFullSpace',
        )
        .mockResolvedValue(space);
    const controller = new SpaceController({
        getSpaceService: () => service,
    } as unknown as ServiceRepository);
    try {
        await expect(run(allowApiKeyAuthentication)).resolves.toBeUndefined();
        await expect(
            controller.updateSpace(
                'project',
                'space',
                { name: 'Renamed' },
                request,
            ),
        ).resolves.toMatchObject({ status: 'ok' });
        expect(spaceModel.update).toHaveBeenCalledOnce();
        spaceModel.update.mockClear();
        await expect(
            controller.updateSpace(
                'project',
                'space',
                { name: 'Renamed', inheritParentPermissions: true },
                request,
            ),
        ).rejects.toMatchObject({
            refusal: { reason: 'agent_capability_denied' },
        });
        expect(spaceModel.update).not.toHaveBeenCalled();
        expect(spaceModel.updateWithCopiedPermissions).not.toHaveBeenCalled();
    } finally {
        policyRead.mockRestore();
        assemble.mockRestore();
    }
});

it.each([null, [], [defaultSessionUser.userUuid], ['another-user']])(
    'OAuth REST enforces named users %j',
    async (allowedUserUuids) => {
        const { run } = setup({
            operation: 'UserController_getAccount',
            scopes: ['read'],
            allowedUserUuids,
            projectUuid: null,
        });
        if (
            allowedUserUuids === null ||
            allowedUserUuids.includes(defaultSessionUser.userUuid)
        ) {
            await expect(
                run(allowApiKeyAuthentication),
            ).resolves.toBeUndefined();
        } else {
            await expect(run(allowApiKeyAuthentication)).resolves.toMatchObject(
                {
                    refusal: {
                        reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                        settingsUrl: '/generalSettings/agentIdentity',
                    },
                },
            );
        }
    },
);
