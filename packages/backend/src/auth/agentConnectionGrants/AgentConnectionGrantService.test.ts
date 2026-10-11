import {
    AgentCapability,
    FeatureFlags,
    type AgentConnectionExecution,
} from '@lightdash/common';
import { fromOauth } from '../account/account';
import { defaultSessionUser } from '../account/account.mock';
import { AgentConnectionGrantService } from './AgentConnectionGrantService';
import { grantFixture, projectGrantFixture } from './grant.mock';
import { managedExecutionFixture } from './managedExecution.mock';

const setup = () => {
    const grant = grantFixture();
    const user = {
        ...defaultSessionUser,
        userUuid: grant.subjectUserUuid,
        organizationUuid: grant.organizationUuid,
    };
    const token = {
        accessToken: 'token',
        agentConnectionGrantUuid: grant.grantUuid,
        familyUuid: grant.refreshFamilyUuid,
        resource: grant.resource,
        client: {
            id: grant.clientId,
            grants: ['authorization_code', 'refresh_token'],
        },
        user,
    };
    const deps = {
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        },
        getAgentPermissionService: () => ({
            assertOperation: vi.fn().mockResolvedValue(undefined),
        }),
        model: {
            findActive: vi.fn().mockResolvedValue(grant),
            touchLastUsed: vi.fn().mockResolvedValue(undefined),
        },
        featureFlags: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        resourceResolver: {
            resolveProjectUuid: vi
                .fn()
                .mockImplementation(async (_org: string, id: string) =>
                    id === 'slug' ? grant.approvedProjectUuids[0] : id,
                ),
            resolveDeploySession: vi.fn().mockResolvedValue({
                projectUuid: grant.approvedProjectUuids[0],
                userUuid: grant.subjectUserUuid,
            }),
            resolveResourceProjectUuid: vi
                .fn()
                .mockResolvedValue(grant.approvedProjectUuids[0]),
        },
    };
    const service = new AgentConnectionGrantService(deps);
    return { service, deps, grant, token, user };
};
it.each([
    'subject',
    'org',
    'client',
    'resource',
    'family',
    'missing',
    'subject_flag',
    'org_flag',
])('refuses invalid binding: %s', async (mismatch) => {
    const { service, deps, token, user, grant } = setup();
    if (mismatch === 'subject') grant.subjectUserUuid = 'other';
    if (mismatch === 'org') grant.organizationUuid = 'other';
    if (mismatch === 'client') grant.clientId = 'other';
    if (mismatch === 'resource') grant.resource = 'other';
    if (mismatch === 'family') grant.refreshFamilyUuid = 'other';
    if (mismatch === 'missing') deps.model.findActive.mockResolvedValue(null);
    if (mismatch.endsWith('flag'))
        deps.featureFlags.get.mockImplementation(async (args) => ({
            enabled:
                mismatch === 'subject_flag'
                    ? !args.user.userUuid
                    : !!args.user.userUuid,
        }));
    await expect(service.authenticate(token, user)).rejects.toMatchObject({
        name: 'invalid_token',
    });
    expect(deps.model.touchLastUsed).not.toHaveBeenCalled();
});
it('returns validated metadata and resolves both flag scopes', async () => {
    const { service, token, user, grant, deps } = setup();
    const metadata = await service.authenticate(token, user);
    expect(metadata).toMatchObject({
        grantUuid: grant.grantUuid,
        revision: 1,
        approvedProjectUuids: grant.approvedProjectUuids,
        approvedCapabilities: grant.approvedCapabilities,
        expiresAt: grant.expiresAt,
        clientId: grant.clientId,
        resource: grant.resource,
    });
    expect(deps.featureFlags.get).toHaveBeenCalledWith({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: {
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
        },
    });
    expect(deps.featureFlags.get).toHaveBeenCalledWith({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: { organizationUuid: user.organizationUuid },
    });
    expect(deps.model.touchLastUsed).toHaveBeenCalledWith(grant.grantUuid);
});
it('leaves unbound OAuth unchanged', async () => {
    const { service, token, user, deps } = setup();
    expect(
        await service.authenticate(
            { ...token, agentConnectionGrantUuid: null },
            user,
        ),
    ).toBeNull();
    expect(deps.featureFlags.get).not.toHaveBeenCalled();
    expect(
        fromOauth(user, token).authentication.agentConnectionGrant,
    ).toBeNull();
});
it('resolves only the project consumed by the handler', async () => {
    const { service, token, user, grant } = setup();
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                query: {},
                params: { projectUuid: 'slug' },
                body: { targetProjectUuid: 'other' },
            },
            'ProjectController.getProject',
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                query: { projectUuid: grant.approvedProjectUuids[0] },
                params: {},
                body: { projectUuid: grant.approvedProjectUuids[0] },
            },
            'ProjectController.getProject',
        ),
    ).rejects.toThrow('unresolved');
});
it.each(['target', 'sourceUuid'])(
    'denies deploy override %s',
    async (field) => {
        const { service, token, user, grant } = setup();
        grant.approvedCapabilities = [AgentCapability.DeployUpload];
        const account = fromOauth(
            user,
            token,
            null,
            await service.authenticate(token, user),
        );
        await expect(
            service.assertRestOperation(
                {
                    account,
                    method: 'POST',
                    query: {},
                    params: { projectUuid: grant.approvedProjectUuids[0] },
                    body: {
                        [field]:
                            field === 'target'
                                ? { database: 'other' }
                                : 'other',
                    },
                },
                'DeployController.deployExplores',
            ),
        ).rejects.toThrow('override');
    },
);

it('resolves a resource slug using its explicit project scope', async () => {
    const { service, token, user, grant, deps } = setup();
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                params: { dashboardUuidOrSlug: 'dashboard-slug' },
                query: { projectUuid: grant.approvedProjectUuids[0] },
                body: {},
            },
            'dashboardRouter GET /:dashboardUuidOrSlug',
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
    expect(
        deps.resourceResolver.resolveResourceProjectUuid,
    ).toHaveBeenCalledWith({
        type: 'dashboard',
        uuid: 'dashboard-slug',
        projectUuid: grant.approvedProjectUuids[0],
    });
});
it('cannot hide a resource slug behind an injected body project', async () => {
    const { service, token, user, grant } = setup();
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                params: { dashboardUuidOrSlug: 'dashboard-slug' },
                query: {},
                body: { projectUuid: grant.approvedProjectUuids[0] },
            },
            'dashboardRouter GET /:dashboardUuidOrSlug',
        ),
    ).rejects.toThrow('unresolved');
});

it('refuses promotions even when both projects are approved', async () => {
    const { service, token, user, grant } = setup();
    grant.approvedCapabilities = Object.values(AgentCapability);
    grant.approvedProjectUuids.push('upstream');
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'POST',
                query: {},
                params: { projectUuid: grant.approvedProjectUuids[0] },
                body: {},
            },
            'DashboardController.promoteDashboard',
        ),
    ).rejects.toThrow('operation');
});

it('does not accept fake project fields on an organization-wide content listing', async () => {
    const { service, token, user, grant } = setup();
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                params: {},
                query: { projectUuid: grant.approvedProjectUuids[0] },
                body: { projectUuid: grant.approvedProjectUuids[0] },
            },
            'ContentController.listContent',
        ),
    ).rejects.toThrow('unresolved');
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                params: {},
                query: { projectUuids: grant.approvedProjectUuids },
                body: {},
            },
            'ContentController.listContent',
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
});
it('refuses content moves without reviewed source and destination contracts', async () => {
    const { service, token, user, grant, deps } = setup();
    grant.approvedCapabilities = [AgentCapability.Publish];
    deps.resourceResolver.resolveResourceProjectUuid.mockResolvedValue('other');
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'POST',
                query: {},
                params: { projectUuid: grant.approvedProjectUuids[0] },
                body: {
                    item: {
                        contentType: 'dashboard',
                        uuid: grant.approvedProjectUuids[0],
                    },
                    action: {
                        type: 'move',
                        targetSpaceUuid: '22222222-2222-4222-8222-222222222222',
                    },
                },
            },
            'ContentController.moveContent',
        ),
    ).rejects.toThrow('operation');
});

it('rejects unknown grant contracts at authentication', async () => {
    const { service, token, user, grant } = setup();
    grant.grantContractVersion = 2;
    await expect(service.authenticate(token, user)).rejects.toMatchObject({
        name: 'invalid_token',
    });
});

it.each([
    [
        'SqlRunnerController.deleteSqlChart',
        {
            projectUuid: '11111111-1111-4111-8111-111111111111',
            uuid: '22222222-2222-4222-8222-222222222222',
        },
    ],
    [
        'SchedulerController.get',
        { schedulerUuid: '22222222-2222-4222-8222-222222222222' },
    ],
])('checks the actual resource for %s', async (operation, params) => {
    const { service, token, user, grant, deps } = setup();
    grant.approvedCapabilities = Object.values(AgentCapability);
    deps.resourceResolver.resolveResourceProjectUuid.mockResolvedValue('other');
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                params,
                query: { projectUuid: grant.approvedProjectUuids[0] },
                body: {},
            },
            operation,
        ),
    ).rejects.toThrow('project');
});
it.each([
    'SchedulerController.getUserSchedulers',
    'ProjectController.getTablesConfiguration',
])('refuses an unregistered operation %s', async (operation) => {
    const { service, token, user, grant } = setup();
    grant.approvedCapabilities = Object.values(AgentCapability);
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                params: { projectUuid: grant.approvedProjectUuids[0] },
                query: { projectUuid: grant.approvedProjectUuids[0] },
                body: {},
            },
            operation,
        ),
    ).rejects.toThrow('operation');
});
it.each([null, 'sourceUuid', 'targetDatabase', 'targetRegion'])(
    'handles legacy deploy query override %s',
    async (field) => {
        const { service, token, user, grant } = setup();
        grant.approvedCapabilities = [AgentCapability.DeployUpload];
        const account = fromOauth(
            user,
            token,
            null,
            await service.authenticate(token, user),
        );
        const result = service.assertRestOperation(
            {
                account,
                method: 'PUT',
                params: { projectUuid: grant.approvedProjectUuids[0] },
                query: field ? { [field]: 'other' } : {},
                body: [],
            },
            'ExploreController.SetExplores',
        );
        if (field) await expect(result).rejects.toThrow('override');
        else await expect(result).resolves.toEqual(grant.approvedProjectUuids);
    },
);
it.each(['sql', 'duckdb', 'external'])(
    'requires raw SQL for query source %s',
    async (sourceType) => {
        const { service, token, user, grant } = setup();
        const account = fromOauth(
            user,
            token,
            null,
            await service.authenticate(token, user),
        );
        await expect(
            service.assertRestOperation(
                {
                    account,
                    method: 'POST',
                    params: { projectUuid: grant.approvedProjectUuids[0] },
                    query: {},
                    body: { queries: [{ sourceType, sql: 'select 1' }] },
                },
                'QuerySourceController.executeSourceQueries',
            ),
        ).rejects.toThrow('SQL');
    },
);

it('requires raw SQL for warehouse schema scans and allows explicit approval', async () => {
    const { service, token, user, grant } = setup();
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    const req = {
        account,
        method: 'GET',
        params: {
            projectUuid: grant.approvedProjectUuids[0],
            sourceType: 'sql',
        },
        query: {},
        body: {},
    };
    await expect(
        service.assertRestOperation(
            req,
            'QuerySourceController.scanQuerySourceSchema',
        ),
    ).rejects.toThrow('SQL');
    account.authentication.agentConnectionGrant!.approvedCapabilities.push(
        AgentCapability.RawSql,
    );
    await expect(
        service.assertRestOperation(
            req,
            'QuerySourceController.scanQuerySourceSchema',
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
    await expect(
        service.assertRestOperation(
            {
                ...req,
                method: 'POST',
                body: { queries: [{ sourceType: 'sql', sql: 'select 1' }] },
            },
            'QuerySourceController.executeSourceQueries',
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
});
it.each([
    'AppGenerateController.listProjectApps',
    'AppGenerateController.listProjectChartTypes',
    'AppGenerateController.getAppCode',
    'ValidationController.get',
])('allows project-scoped CLI read %s', async (operation) => {
    const { service, token, user, grant } = setup();
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'GET',
                params: {
                    projectUuid: grant.approvedProjectUuids[0],
                    appUuidOrSlug: 'app',
                },
                query: {},
                body: {},
            },
            operation,
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
});
it('refuses saved PNG export even with export approval', async () => {
    const { service, token, user, grant, deps } = setup();
    grant.approvedCapabilities = Object.values(AgentCapability);
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    await expect(
        service.assertRestOperation(
            {
                account,
                method: 'POST',
                params: { chartUuid: '22222222-2222-4222-8222-222222222222' },
                query: {},
                body: {},
            },
            'SavedChartController.exportSavedChartImage',
        ),
    ).rejects.toThrow('operation');
    expect(
        deps.resourceResolver.resolveResourceProjectUuid,
    ).not.toHaveBeenCalled();
});

it.each(
    [
        'DeployController.addDeployBatch',
        'DeployController.finalizeDeploySession',
    ].flatMap((operation) =>
        ['project', 'owner', 'valid'].map((binding) => ({
            operation,
            binding,
        })),
    ),
)(
    'resolves the stored project and owner for $operation with $binding binding',
    async ({ operation, binding }) => {
        const { service, token, user, grant, deps } = setup();
        grant.approvedCapabilities = [AgentCapability.DeployUpload];
        const account = fromOauth(
            user,
            token,
            null,
            await service.authenticate(token, user),
        );
        deps.resourceResolver.resolveDeploySession.mockResolvedValue({
            projectUuid:
                binding === 'project' ? 'other' : grant.approvedProjectUuids[0],
            userUuid: binding === 'owner' ? 'other' : user.userUuid,
        });
        const result = service.assertRestOperation(
            {
                account,
                method: 'POST',
                query: {},
                params: {
                    projectUuid: grant.approvedProjectUuids[0],
                    sessionUuid: 'session',
                },
                body: {},
            },
            operation,
        );
        if (binding === 'valid')
            await expect(result).resolves.toEqual(grant.approvedProjectUuids);
        else await expect(result).rejects.toThrow('deploy session');
    },
);
it.each([
    'ProjectCoderController.upsertChartAsCode',
    'ProjectCoderController.upsertDashboardAsCode',
    'ProjectCoderController.upsertSqlChartAsCode',
    'ProjectCoderController.upsertVirtualViewAsCode',
])(
    'refuses access payloads even with every capability for %s',
    async (operation) => {
        const { service, token, user, grant } = setup();
        grant.approvedCapabilities = Object.values(AgentCapability);
        const account = fromOauth(
            user,
            token,
            null,
            await service.authenticate(token, user),
        );
        await Promise.all(
            [
                { users: [], groups: [] },
                {
                    users: [{ email: 'reader@example.com', role: 'viewer' }],
                    groups: [],
                },
                null,
            ].map(async (access) => {
                await expect(
                    service.assertRestOperation(
                        {
                            account,
                            method: 'POST',
                            query: {},
                            params: {
                                projectUuid: grant.approvedProjectUuids[0],
                            },
                            body: { access },
                        },
                        operation,
                    ),
                ).rejects.toThrow('request body');
            }),
        );
    },
);
it('refuses refresh content sync but allows compile-only refresh', async () => {
    const { service, token, user, grant } = setup();
    grant.approvedCapabilities = [AgentCapability.DeployUpload];
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    const req = {
        account,
        method: 'POST',
        query: {},
        params: { projectUuid: grant.approvedProjectUuids[0] },
        body: {},
    };
    await expect(
        service.assertRestOperation(
            { ...req, body: { syncContent: true } },
            'ProjectController.refresh',
        ),
    ).rejects.toThrow('request body');
    await Promise.all(
        [{}, { syncContent: false }].map(async (body) => {
            await expect(
                service.assertRestOperation(
                    { ...req, body },
                    'ProjectController.refresh',
                ),
            ).resolves.toEqual(grant.approvedProjectUuids);
        }),
    );
});

const executionFixture = (
    grant: ReturnType<typeof grantFixture>,
): AgentConnectionExecution => ({
    grantUuid: grant.grantUuid,
    revision: grant.grantRevision,
    subjectUserUuid: grant.subjectUserUuid,
    organizationUuid: grant.organizationUuid,
    clientId: grant.clientId,
    resource: grant.resource,
    refreshFamilyUuid: grant.refreshFamilyUuid!,
    scopes: ['read'],
    operation: { kind: 'rest', key: 'QueryController.executeAsyncSqlQuery' },
});

describe('fresh connection execution', () => {
    it.each([
        'missing',
        'revoked',
        'expired',
        'revision',
        'subject',
        'organization',
        'client',
        'audience',
        'family',
        'subject_flag',
        'org_flag',
        'inactive_person',
        'removed_person',
    ])('refuses %s before the effect', async (reason) => {
        const { service, deps, grant, user } = setup();
        grant.clientId = 'lightdash-cli';
        grant.approvedCapabilities = Object.values(AgentCapability);
        const execution = executionFixture(grant);
        if (reason === 'missing') deps.model.findActive.mockResolvedValue(null);
        if (reason === 'revoked') grant.revokedAt = new Date();
        if (reason === 'expired') grant.expiresAt = new Date(0);
        if (reason === 'revision') grant.grantRevision += 1;
        if (reason === 'subject') grant.subjectUserUuid = 'other';
        if (reason === 'organization') grant.organizationUuid = 'other';
        if (reason === 'client') grant.clientId = 'other';
        if (reason === 'audience') grant.resource = 'other';
        if (reason === 'family') grant.refreshFamilyUuid = 'other';
        if (reason === 'inactive_person') user.isActive = false;
        if (reason === 'removed_person') user.organizationUuid = 'other';
        if (reason.endsWith('flag'))
            deps.featureFlags.get.mockImplementation(async (args) => ({
                enabled:
                    reason === 'subject_flag'
                        ? !args.user.userUuid
                        : !!args.user.userUuid,
            }));
        const effect = vi.fn();
        await expect(
            service
                .assertActiveExecution(execution, {
                    projectUuid: grant.approvedProjectUuids[0],
                    capabilities: [AgentCapability.Query],
                    recheckOperation: true,
                })
                .then(effect),
        ).rejects.toThrow();
        expect(effect).not.toHaveBeenCalled();
    });
    it('restores enforced OAuth access without a bearer and preserves the grant across token refresh', async () => {
        const { service, grant } = setup();
        grant.clientId = 'lightdash-cli';
        grant.approvedCapabilities = Object.values(AgentCapability);
        const execution = executionFixture(grant);
        const first = await service.assertActiveExecution(execution, {
            projectUuid: grant.approvedProjectUuids[0],
            capabilities: [AgentCapability.ReadDiscover],
            recheckOperation: false,
        });
        const refreshed = await service.assertActiveExecution(
            JSON.parse(JSON.stringify(execution)),
            {
                projectUuid: grant.approvedProjectUuids[0],
                capabilities: [AgentCapability.ReadDiscover],
                recheckOperation: false,
            },
        );
        expect(refreshed.scope.claim).toEqual(first.scope.claim);
        expect(first.account.authentication).toMatchObject({
            type: 'oauth',
            token: '',
            scopes: ['read'],
            agentConnectionGrant: { grantUuid: grant.grantUuid },
        });
        expect(first.account.user.ability.can('update', 'Project')).toBe(false);
        expect(first.account.user.ability.can('view', 'Project')).toBe(true);
        grant.grantRevision += 1;
        await expect(
            service.assertActiveExecution(execution, {
                projectUuid: grant.approvedProjectUuids[0],
                capabilities: [],
                recheckOperation: false,
            }),
        ).rejects.toThrow();
    });
    it.each(['project', 'capability'])(
        'rechecks the current approved %s',
        async (reason) => {
            const { service, grant } = setup();
            grant.clientId = 'lightdash-cli';
            const execution = executionFixture(grant);
            const projectUuid = grant.approvedProjectUuids[0];
            if (reason === 'project') grant.approvedProjectUuids = [];
            else grant.approvedCapabilities = [];
            await expect(
                service.assertActiveExecution(execution, {
                    projectUuid,
                    capabilities: [AgentCapability.ReadDiscover],
                    recheckOperation: false,
                }),
            ).rejects.toThrow();
        },
    );
});

describe('current managed policy intersection', () => {
    it.each(Object.values(AgentCapability))(
        'rechecks the current %s capability',
        async (capability) => {
            const f = managedExecutionFixture();
            const run = () =>
                f.service.assertActiveExecution(f.execution, {
                    projectUuid: f.projectUuid,
                    capabilities: [capability],
                    recheckOperation: false,
                });
            await expect(run()).resolves.toBeDefined();
            f.policy.systemRoleMatrix.viewer = Object.values(
                AgentCapability,
            ).filter((value) => value !== capability);
            await expect(run()).rejects.toMatchObject({
                refusal: { capability },
            });
        },
    );
    it('refuses an unknown capability even if stored grant data includes it', async () => {
        const f = managedExecutionFixture();
        const unknown = 'unknown' as AgentCapability;
        f.grant.approvedCapabilities.push(unknown);
        await expect(
            f.service.assertActiveExecution(f.execution, {
                projectUuid: f.projectUuid,
                capabilities: [unknown],
                recheckOperation: false,
            }),
        ).rejects.toThrow();
    });
    it.each(['project', 'user', 'project role'] as const)(
        'rechecks the current %s limit',
        async (limit) => {
            const f = managedExecutionFixture();
            const run = () =>
                f.service.assertActiveExecution(f.execution, {
                    projectUuid: f.projectUuid,
                    capabilities: [AgentCapability.ContentWrite],
                    recheckOperation: false,
                });
            await expect(run()).resolves.toBeDefined();
            if (limit === 'project') f.policy.allowedProjectUuids = [];
            if (limit === 'user') f.policy.allowedUserUuids = [];
            if (limit === 'project role') f.assignments.systemRoles = [];
            await expect(run()).rejects.toThrow();
        },
    );
});

describe.each([false, true])(
    'v2 queued effects with recheckOperation=%s',
    (recheckOperation) => {
        it.each([
            [AgentCapability.Query, 0, true],
            [AgentCapability.DeployUpload, 0, false],
            [AgentCapability.DeployUpload, 1, true],
            [AgentCapability.Query, 1, false],
        ] as const)(
            'checks %s on project %s',
            async (capability, project, allowed) => {
                const f = managedExecutionFixture();
                Object.assign(f.grant, projectGrantFixture(), {
                    clientId: 'lightdash-cli',
                });
                f.execution.operation.key =
                    capability === AgentCapability.Query
                        ? 'QueryController.executeAsyncMetricQuery'
                        : 'ProjectController.refresh';
                const run = () =>
                    f.service.assertActiveExecution(f.execution, {
                        projectUuid: f.grant.approvedProjectUuids[project],
                        capabilities: [capability],
                        recheckOperation,
                    });
                if (allowed) await expect(run()).resolves.toBeDefined();
                else await expect(run()).rejects.toThrow();
            },
        );
        it('cannot widen approval when current policy is raised after approval', async () => {
            const f = managedExecutionFixture();
            Object.assign(f.grant, projectGrantFixture(), {
                clientId: 'lightdash-cli',
            });
            f.policy.systemRoleMatrix.viewer = [AgentCapability.Query];
            const run = () =>
                f.service.assertActiveExecution(f.execution, {
                    projectUuid: f.projectUuid,
                    capabilities: [AgentCapability.DeployUpload],
                    recheckOperation,
                });
            await expect(run()).rejects.toThrow();
            f.policy.systemRoleMatrix.viewer = Object.values(AgentCapability);
            await expect(run()).rejects.toThrow();
            await expect(
                f.service.assertActiveExecution(f.execution, {
                    projectUuid: f.grant.approvedProjectUuids[1],
                    capabilities: [AgentCapability.DeployUpload],
                    recheckOperation,
                }),
            ).resolves.toBeDefined();
        });
    },
);

it('checks every project resolved by a multi-project REST contract', async () => {
    const f = setup();
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    Object.assign(
        f.grant,
        projectGrantFixture({
            [a]: [AgentCapability.ReadDiscover],
            [b]: [AgentCapability.DeployUpload],
        }),
    );
    const account = fromOauth(
        f.user,
        f.token,
        null,
        await f.service.authenticate(f.token, f.user),
    );
    const run = (projects: string[]) =>
        f.service.assertRestOperation(
            {
                account,
                method: 'GET',
                params: {},
                query: { projectUuids: projects },
                body: {},
            },
            'ContentController.listContent',
        );
    await expect(run([a])).resolves.toEqual([a]);
    await expect(run([a, b])).rejects.toThrow();
});
