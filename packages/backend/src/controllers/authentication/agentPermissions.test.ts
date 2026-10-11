import { Ability } from '@casl/ability';
import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request, type RequestHandler, type Response } from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import passport from 'passport';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import { lightdashConfig } from '../../config/lightdashConfig';
import { authenticateServiceAccount } from '../../ee/authentication';
import { errorHandler } from '../../errors';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../services/AgentPermissionService/AgentPermissionService';
import {
    expectAdmissionSql,
    setupPermissionSql,
} from '../../services/AgentPermissionService/agentPermissionSqlFixture';
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

const restrictedCapabilities = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
] as const;

const setup = ({
    mode = 'managed',
    operation = 'ProjectController_createDashboard',
    authentication = 'oauth',
    scopes = ['write'],
    projectUuid = 'project',
    allowedProjectUuids = null,
    allowedUserUuids = null,
    allowedGroupUuids = null,
}: {
    mode?: 'off' | 'legacy' | 'managed';
    operation?: string;
    authentication?: 'oauth' | 'pat' | 'session';
    scopes?: string[];
    projectUuid?: string | null;
    allowedProjectUuids?: string[] | null;
    allowedUserUuids?: string[] | null;
    allowedGroupUuids?: string[] | null;
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
        allowedGroupUuids,
        systemRoleMatrix: agentSystemRoleMatrix(restrictedCapabilities),
    });
    const resolveResourceProjectUuid = vi.fn().mockResolvedValue(null);
    const groupsModel = { findUserInGroups: vi.fn().mockResolvedValue([]) };
    const service = new AgentPermissionService({
        groupsModel,
        areGroupsAvailable: vi.fn().mockResolvedValue(true),
        resolveResourceProjectUuid,
        isCustomRolesLicensed: () => false,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: mode !== 'off' }),
        },
        agentCapabilityPolicyModel: {
            get: getPolicy,
            getForEnforcement: async () => {
                const policy = await getPolicy();
                return {
                    ...policy,
                    storedAllowedGroupUuids: policy.allowedGroupUuids,
                    hasExistingAllowedGroup:
                        policy.allowedGroupUuids === null
                            ? null
                            : policy.allowedGroupUuids.length > 0,
                };
            },
            save: vi.fn(),
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
    const assertOperationWithRequest = vi.spyOn(
        service,
        'assertOperationWithRequest',
    );
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
                isAccessTokenBoundToGrant: vi.fn().mockResolvedValue(false),
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
        groupsModel,
        run,
        assertOperationWithRequest,
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
        const { run, assertOperationWithRequest } = setup();
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
        expect(assertOperationWithRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: expect.objectContaining({
                    kind: 'rest_operation',
                    projectUuid: 'project',
                    key: 'ProjectController.createDashboard',
                }),
            }),
        );
        expect(
            assertOperationWithRequest.mock.calls[0][0].operation.surface,
        ).toBe('api');
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
        const { run, assertOperationWithRequest } = setup({ scopes: ['read'] });
        expect(await run(middleware)).toBeInstanceOf(ForbiddenError);
        expect(assertOperationWithRequest).not.toHaveBeenCalled();
    });
    it('passes null when the route has no project path parameter', async () => {
        const { run, assertOperationWithRequest } = setup({
            operation: 'OrganizationController_getProjects',
            projectUuid: null,
        });
        await expect(run(middleware)).resolves.toBeUndefined();
        expect(assertOperationWithRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: expect.objectContaining({ projectUuid: null }),
            }),
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
                assertOperationWithRequest,
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
            expect(
                assertOperationWithRequest.mock.calls[0][0].operation
                    .projectUuid,
            ).toBe('project');
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
        const {
            request,
            run,
            resolveResourceProjectUuid,
            assertOperationWithRequest,
        } = setup({ projectUuid: null });
        request.params.dashboardUuid = 'ae9b5604-df2a-47bb-b04f-85822df26f7d';
        const failure = new Error('Resource unavailable');
        resolveResourceProjectUuid.mockRejectedValue(failure);
        expect(await run(middleware)).toBe(failure);
        expect(assertOperationWithRequest).not.toHaveBeenCalled();
    });
    it('refuses an unresolved resource project when the policy limits projects', async () => {
        const { request, run, assertOperationWithRequest } = setup({
            operation: 'QueryController_executeAsyncMetricQuery',
            projectUuid: null,
            allowedProjectUuids: ['project'],
        });
        request.params.queryUuid = 'ae9b5604-df2a-47bb-b04f-85822df26f7d';
        expect(await run(middleware)).toMatchObject({
            statusCode: 403,
            refusal: { reason: AiAccessRefusalReason.AGENT_PROJECT_DENIED },
        });
        expect(
            assertOperationWithRequest.mock.calls[0][0].operation.projectUuid,
        ).toBeNull();
    });
    it('does not send a slug to UUID resource lookup', async () => {
        const {
            request,
            run,
            resolveResourceProjectUuid,
            assertOperationWithRequest,
        } = setup({ projectUuid: null });
        request.params.dashboardUuidOrSlug = 'dashboard-slug';
        expect(await run(middleware)).toBeInstanceOf(AiAccessRefusedError);
        expect(resolveResourceProjectUuid).not.toHaveBeenCalled();
        expect(
            assertOperationWithRequest.mock.calls[0][0].operation.projectUuid,
        ).toBeNull();
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
        const { request, run, assertOperationWithRequest } = setup();
        request.baseUrl = '/api/v1/mcp';
        await expect(run(middleware)).resolves.toBeUndefined();
        expect(assertOperationWithRequest).not.toHaveBeenCalled();
    });
    it('uses a route scope guard for a handwritten route', async () => {
        const { request, run, assertOperationWithRequest } = setup({
            operation: 'anonymous',
        });
        request.route.stack.unshift({
            handle: requireOAuthScopeOperation(
                'ProjectController.createDashboard',
            ),
        });
        expect(await run(middleware)).toBeInstanceOf(AiAccessRefusedError);
        expect(assertOperationWithRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: expect.objectContaining({
                    key: 'ProjectController.createDashboard',
                }),
            }),
        );
    });
});

it.each(['pat', 'session'] as const)(
    'leaves %s outside the agent policy',
    async (authentication) => {
        const { run, assertOperationWithRequest, getPolicy } = setup({
            authentication,
            allowedUserUuids: [],
        });
        await expect(run(allowApiKeyAuthentication)).resolves.toBeUndefined();
        expect(assertOperationWithRequest).not.toHaveBeenCalled();
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
            allowedGroupUuids: null,
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
        allowedGroupUuids: null,
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
        allowedGroupUuids: null,
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

test.each([allowOauthAuthentication, allowApiKeyAuthentication])(
    'OAuth legacy admission precedes managed resource work',
    async (middleware) => {
        const h = setup({
            mode: 'legacy',
            operation: 'SavedChartController_get',
            projectUuid: null,
            allowedGroupUuids: ['group'],
        });
        h.request.params = { chartUuid: 'chart' };
        expect(await h.run(middleware)).toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
        });
        expect(h.resolveResourceProjectUuid).not.toHaveBeenCalled();
        expect(h.groupsModel.findUserInGroups).toHaveBeenCalledOnce();
        h.groupsModel.findUserInGroups.mockResolvedValue([
            { groupUuid: 'group' },
        ]);
        expect(await h.run(middleware)).toBeUndefined();
        expect(h.resolveResourceProjectUuid).not.toHaveBeenCalled();
    },
);

const admissionDatabase = knex({ client: MockClient, dialect: 'pg' });
const admissionTracker = getTracker();
beforeEach(() => admissionTracker.reset());
afterAll(async () => admissionDatabase.destroy());

test.each([allowOauthAuthentication, allowApiKeyAuthentication])(
    'SQL admission uses one handle in REST %s',
    async (middleware) => {
        const h = setup({
            mode: 'legacy',
            operation: 'UserController_getAccount',
        });
        const sql = setupPermissionSql(
            admissionDatabase,
            admissionTracker,
            fromSession(defaultSessionUser),
        );
        h.request.services.getAgentPermissionService = () => sql.service;
        await expect(h.run(middleware)).resolves.toBeUndefined();
        expectAdmissionSql(admissionTracker, {
            policy: 1,
            groups: 0,
            people: 0,
            membership: 1,
        });
    },
);

test.each([0, 1, 3])(
    'SQL admission shares bound REST fan-out for %i projects',
    async (count) => {
        const h = setup({ operation: 'UserController_getAccount' });
        const sql = setupPermissionSql(
            admissionDatabase,
            admissionTracker,
            fromSession(defaultSessionUser),
        );
        sql.state.policy.mode = 'managed';
        const grant = { ...grantFixture(), clientId: 'lightdash-cli' };
        const oauth = Object.assign(h.request.services.getOauthService(), {
            getSiteUrl: () => grant.resource,
        });
        const authenticate = oauth.authenticate.bind(oauth);
        vi.spyOn(oauth, 'authenticate').mockImplementation(async (...args) => {
            const token = await authenticate(...args);
            return {
                ...token,
                agentConnectionGrantUuid: grant.grantUuid,
                familyUuid: 'family',
                resource: grant.resource,
                client: { ...token.client, id: grant.clientId },
            };
        });
        h.request.services.getOauthService = () => oauth;
        h.request.services.getAgentConnectionGrantService = () =>
            ({
                authenticate: vi.fn().mockResolvedValue({
                    ...grant,
                    revision: grant.grantRevision,
                }),
                loadSessionUser: vi.fn(
                    async (id: string, organization: string) =>
                        h.request.services
                            .getUserService()
                            .findSessionUser({ id, organization }),
                ),
                assertRestOperation: vi
                    .fn()
                    .mockResolvedValue(
                        Array.from({ length: count }, (_, n) => `project-${n}`),
                    ),
            }) as unknown as ReturnType<
                ServiceRepository['getAgentConnectionGrantService']
            >;
        h.request.services.getAgentPermissionService = () => sql.service;
        const assertion = vi.spyOn(sql.service, 'assertOperationWithRequest');
        await expect(h.run(allowOauthAuthentication)).resolves.toBeUndefined();
        expect(assertion).toHaveBeenCalledTimes(Math.max(1, count));
        expect(
            sql.deps.userModel.getAgentRoleAssignments,
        ).toHaveBeenCalledTimes(Math.max(1, count));
        expectAdmissionSql(admissionTracker, {
            policy: 1,
            groups: 0,
            people: 0,
            membership: 1,
        });
    },
);

test('bound REST retains every refusal and activity record in concurrent fan-out', async () => {
    const h = setup({ operation: 'UserController_getAccount' });
    const sql = setupPermissionSql(
        admissionDatabase,
        admissionTracker,
        fromSession(defaultSessionUser),
    );
    sql.state.policy.mode = 'managed';
    sql.state.members = [];
    const grant = { ...grantFixture(), clientId: 'lightdash-cli' };
    const oauth = Object.assign(h.request.services.getOauthService(), {
        getSiteUrl: () => grant.resource,
    });
    const authenticate = oauth.authenticate.bind(oauth);
    vi.spyOn(oauth, 'authenticate').mockImplementation(async (...args) => {
        const token = await authenticate(...args);
        return {
            ...token,
            agentConnectionGrantUuid: grant.grantUuid,
            familyUuid: 'family',
            resource: grant.resource,
            client: { ...token.client, id: grant.clientId },
        };
    });
    h.request.services.getOauthService = () => oauth;
    h.request.services.getAgentConnectionGrantService = () =>
        ({
            authenticate: vi.fn().mockResolvedValue({
                ...grant,
                revision: grant.grantRevision,
            }),
            loadSessionUser: vi.fn(async (id: string, organization: string) =>
                h.request.services
                    .getUserService()
                    .findSessionUser({ id, organization }),
            ),
            assertRestOperation: vi
                .fn()
                .mockResolvedValue(['one', 'two', 'three']),
        }) as unknown as ReturnType<
            ServiceRepository['getAgentConnectionGrantService']
        >;
    h.request.services.getAgentPermissionService = () => sql.service;
    expect(await h.run(allowOauthAuthentication)).toBeInstanceOf(
        AiAccessRefusedError,
    );
    await vi.waitFor(() =>
        expect(sql.deps.agentActionLogModel.insert).toHaveBeenCalledTimes(3),
    );
    expect(
        sql.deps.agentActionLogModel.insert.mock.calls
            .map(([entry]) => entry.project_uuid)
            .sort(),
    ).toEqual(['one', 'three', 'two']);
    expectAdmissionSql(admissionTracker, {
        policy: 1,
        groups: 0,
        people: 0,
        membership: 1,
    });
});
