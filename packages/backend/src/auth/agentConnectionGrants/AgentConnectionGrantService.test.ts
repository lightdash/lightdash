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
        resolveProjectUuid: vi
            .fn()
            .mockImplementation(async (_org: string, id: string) =>
                id === 'slug' ? grant.approvedProjectUuids[0] : id,
            ),
        resolveResourceProjectUuid: vi
            .fn()
            .mockResolvedValue(grant.approvedProjectUuids[0]),
        resolveUpstreamProjectUuid: vi.fn().mockResolvedValue(null),
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
it.each(['path', 'body', 'slug', 'resource'])(
    'resolves project from %s',
    async (source) => {
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
                    params: (
                        {
                            path: {
                                projectUuid: grant.approvedProjectUuids[0],
                            },
                            slug: { projectUuidOrSlug: 'slug' },
                            resource: {
                                savedQueryUuid: grant.approvedProjectUuids[0],
                            },
                            body: {},
                        } as Record<string, Record<string, string>>
                    )[source],
                    body:
                        source === 'body'
                            ? { projectUuid: grant.approvedProjectUuids[0] }
                            : {},
                },
                'ProjectController.getProject',
            ),
        ).resolves.toEqual(grant.approvedProjectUuids);
    },
);
it('checks every referenced project', async () => {
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
                params: { projectUuid: grant.approvedProjectUuids[0] },
                body: { targetProjectUuid: 'other' },
            },
            'ProjectController.getProject',
        ),
    ).rejects.toThrow('project');
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
                params: { dashboardUuidOrSlug: 'dashboard-slug' },
                query: { projectUuid: grant.approvedProjectUuids[0] },
                body: {},
            },
            'dashboardRouter GET /:dashboardUuidOrSlug',
        ),
    ).resolves.toEqual(grant.approvedProjectUuids);
    expect(deps.resolveResourceProjectUuid).toHaveBeenCalledWith({
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
                params: { dashboardUuidOrSlug: 'dashboard-slug' },
                query: {},
                body: { projectUuid: grant.approvedProjectUuids[0] },
            },
            'dashboardRouter GET /:dashboardUuidOrSlug',
        ),
    ).rejects.toThrow('unresolved');
});

it('requires both projects of an implicit promotion destination', async () => {
    const { service, token, user, grant, deps } = setup();
    grant.approvedCapabilities = [AgentCapability.Publish];
    deps.resolveUpstreamProjectUuid.mockResolvedValue('upstream');
    const account = fromOauth(
        user,
        token,
        null,
        await service.authenticate(token, user),
    );
    const req = {
        account,
        params: { projectUuid: grant.approvedProjectUuids[0] },
        body: {},
    };
    await expect(
        service.assertRestOperation(
            req,
            'DashboardController.promoteDashboard',
        ),
    ).rejects.toThrow('project');
    account.authentication.agentConnectionGrant!.approvedProjectUuids.push(
        'upstream',
    );
    await expect(
        service.assertRestOperation(
            req,
            'DashboardController.promoteDashboard',
        ),
    ).resolves.toEqual([grant.approvedProjectUuids[0], 'upstream']);
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
it('checks a nested content-move destination', async () => {
    const { service, token, user, grant, deps } = setup();
    grant.approvedCapabilities = [AgentCapability.Publish];
    deps.resolveResourceProjectUuid.mockResolvedValue('other');
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
    ).rejects.toThrow('project');
});

it('rejects unknown grant contracts at authentication', async () => {
    const { service, token, user, grant } = setup();
    grant.grantContractVersion = 2;
    await expect(service.authenticate(token, user)).rejects.toMatchObject({
        name: 'invalid_token',
    });
});
