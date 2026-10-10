import { AgentCapability, FeatureFlags } from '@lightdash/common';
import { fromOauth } from '../account/account';
import { defaultSessionUser } from '../account/account.mock';
import { AgentConnectionGrantService } from './AgentConnectionGrantService';
import { grantFixture } from './grant.mock';

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
it('checks the export chart resource and capability', async () => {
    const { service, token, user, grant, deps } = setup();
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    const req = {
        account,
        method: 'POST',
        params: { chartUuid: '22222222-2222-4222-8222-222222222222' },
        query: {},
        body: {},
    };
    await expect(
        service.assertRestOperation(
            req,
            'SavedChartController.exportSavedChartImage',
        ),
    ).rejects.toThrow('Export');
    account.authentication.agentConnectionGrant!.approvedCapabilities.push(
        AgentCapability.Export,
    );
    await expect(
        service.assertRestOperation(
            req,
            'SavedChartController.exportSavedChartImage',
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
    deps.resourceResolver.resolveResourceProjectUuid.mockResolvedValue('other');
    await expect(
        service.assertRestOperation(
            req,
            'SavedChartController.exportSavedChartImage',
        ),
    ).rejects.toThrow('project');
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
