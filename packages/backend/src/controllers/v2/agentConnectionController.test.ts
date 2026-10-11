import { AgentCapability, NotFoundError } from '@lightdash/common';
import { type Request } from 'express';
import { fromApiKey, fromOauth, fromSession } from '../../auth/account/account';
import { AgentConnectionService } from '../../auth/agentConnectionGrants/AgentConnectionService';
import { managedExecutionFixture } from '../../auth/agentConnectionGrants/managedExecution.mock';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { setupGrantAuthentication } from '../authentication/agentConnectionGrants.mock';
import { allowApiKeyAuthentication } from '../authentication/middlewares';
import { AgentConnectionController } from './agentConnectionController';

const setup = () => {
    const f = managedExecutionFixture();
    const rows = [
        f.grant,
        { ...f.grant, grantUuid: 'other-person', subjectUserUuid: 'other' },
        { ...f.grant, grantUuid: 'other-org', organizationUuid: 'other' },
        { ...f.grant, grantUuid: 'second' },
    ];
    const model = {
        find: vi
            .fn()
            .mockImplementation(
                async (id) => rows.find((g) => g.grantUuid === id) ?? null,
            ),
        listForSubject: vi
            .fn()
            .mockImplementation(async ({ organizationUuid, subjectUserUuid }) =>
                rows.filter(
                    (g) =>
                        g.organizationUuid === organizationUuid &&
                        g.subjectUserUuid === subjectUserUuid,
                ),
            ),
        revoke: vi.fn().mockImplementation(async ({ grantUuid }) => {
            rows.find((g) => g.grantUuid === grantUuid)!.revokedAt ??=
                new Date();
        }),
    };
    const flags = { get: vi.fn().mockResolvedValue({ enabled: true }) };
    const service = new AgentConnectionService({
        model,
        featureFlags: flags,
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(f.user),
        },
        projectModel: {
            getAllByOrganizationUuid: vi
                .fn()
                .mockResolvedValue([
                    { projectUuid: f.projectUuid, name: 'Visible' },
                ]),
        },
        getAgentPermissionService: () => f.permissions,
    });
    const controller = new AgentConnectionController({
        getAgentConnectionService: () => service,
    } as ServiceRepository);
    const req = { account: fromSession(f.user, 'session-secret') } as Request;
    return { ...f, req, rows, model, flags, service, controller };
};

it.each(['session', 'pat'])(
    'allows %s to list, inspect and revoke only owned connections with the flag off',
    async (kind) => {
        const f = setup();
        if (kind === 'pat') f.req.account = fromApiKey(f.user, 'pat-secret');
        f.flags.get.mockResolvedValue({ enabled: false });
        const list = await f.controller.list(f.req);
        expect(list.results.map((g) => g.grantUuid)).toEqual([
            'grant',
            'second',
        ]);
        await Promise.all(
            ['other-person', 'other-org', 'missing'].map(async (id) => {
                await expect(
                    f.controller.getConnectionStatus(f.req, id),
                ).rejects.toBeInstanceOf(NotFoundError);
                await expect(
                    f.controller.revoke(f.req, id),
                ).rejects.toBeInstanceOf(NotFoundError);
            }),
        );
        const status = await f.controller.getConnectionStatus(f.req, 'grant');
        expect(status.results.effectiveProjects[0].capabilities[0].reason).toBe(
            'agent_identity_disabled',
        );
        const revoked = await f.controller.revoke(f.req, 'grant');
        expect(revoked.results.status).toBe('revoked');
        expect(await f.controller.revoke(f.req, 'grant')).toEqual(revoked);
        expect(JSON.stringify([list, status, revoked])).not.toMatch(
            /token|secret|family|resource|approvalRequest/i,
        );
    },
);
it('refuses unbound OAuth and service accounts like personal credential management', async () => {
    const f = setup();
    const oauth = fromOauth(f.user, {
        accessToken: 'oauth-secret',
        client: { id: 'client' },
    });
    const serviceAccount = {
        ...f.req.account!,
        authentication: {
            type: 'service-account' as const,
            source: 'secret',
            serviceAccountUuid: 'sa',
            serviceAccountDescription: '',
        },
    };
    await Promise.all(
        [oauth, serviceAccount].map(async (account) => {
            const req = { account } as Request;
            await expect(f.controller.list(req)).rejects.toThrow();
            await expect(
                f.controller.getConnectionStatus(req, 'grant'),
            ).rejects.toThrow();
            await expect(f.controller.revoke(req, 'grant')).rejects.toThrow();
        }),
    );
    expect(f.model.revoke).not.toHaveBeenCalled();
});
it('restricts a connection to its own grant at the service boundary too', async () => {
    const f = setup();
    f.req.account = fromOauth(
        f.user,
        { accessToken: 'access-secret', client: { id: f.grant.clientId } },
        null,
        { ...f.grant, revision: 1 },
    );
    await expect(f.controller.list(f.req)).rejects.toThrow();
    await expect(
        f.controller.getConnectionStatus(f.req, 'second'),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(f.controller.revoke(f.req, 'second')).rejects.toBeInstanceOf(
        NotFoundError,
    );
    const status = await f.controller.getConnectionStatus(f.req, 'grant');
    expect(status.results.effectiveProjects[0].capabilities).toContainEqual({
        capability: AgentCapability.Query,
        allowed: true,
        reason: null,
    });
    await expect(f.controller.revoke(f.req, 'grant')).resolves.toMatchObject({
        results: { status: 'revoked' },
    });
});

it('runs own status and revoke through real authentication despite lost admission, then refuses the revoked bearer with a session', async () => {
    const f = setup();
    const auth = setupGrantAuthentication(f.user);
    Object.assign(auth.grant, f.grant);
    auth.deps.model.findActive.mockImplementation(async () =>
        f.grant.revokedAt ? null : auth.grant,
    );
    auth.permissions.loadRequest.mockResolvedValue({
        enforcementMode: 'managed',
    });
    auth.permissions.assertOperationWithRequest.mockRejectedValue(
        new Error('Agent admission removed'),
    );
    f.policy.systemRoleMatrix.viewer = [];
    auth.req.params = { grantUuid: 'grant' };
    auth.req.route.stack = [
        {
            handle: Object.defineProperty(() => {}, 'name', {
                value: 'AgentConnectionController_getConnectionStatus',
            }),
        },
    ];
    auth.downstream.mockImplementation(() =>
        f.controller.getConnectionStatus(auth.req, 'grant'),
    );
    expect(await auth.run(allowApiKeyAuthentication)).toEqual({
        status: 200,
        error: undefined,
    });
    const status = await auth.downstream.mock.results[0].value;
    expect(status.results.effectiveProjects[0].capabilities).toContainEqual({
        capability: AgentCapability.Query,
        allowed: false,
        reason: 'agent_policy',
    });
    auth.req.route.stack = [
        {
            handle: Object.defineProperty(() => {}, 'name', {
                value: 'AgentConnectionController_revoke',
            }),
        },
    ];
    auth.req.method = 'DELETE';
    auth.downstream.mockImplementation(() =>
        f.controller.revoke(auth.req, 'grant'),
    );
    expect(await auth.run(allowApiKeyAuthentication)).toEqual({
        status: 200,
        error: undefined,
    });
    expect(f.grant.revokedAt).not.toBeNull();
    expect(auth.permissions.assertOperationWithRequest).not.toHaveBeenCalled();
    auth.req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    auth.req.user = auth.user;
    auth.oauth.isAccessTokenBoundToGrant.mockResolvedValue(true);
    auth.downstream.mockClear();
    expect(await auth.run(allowApiKeyAuthentication)).toMatchObject({
        status: 401,
    });
    expect(auth.downstream).not.toHaveBeenCalled();
});

const unreadableLimits = [
    { version: 2 },
    {
        version: 2,
        projectCapabilities: {
            '22222222-2222-4222-8222-222222222222': [AgentCapability.Query],
        },
    },
    { version: 2, projectCapabilities: {} },
    { version: 99 },
    {
        version: 2,
        projectCapabilities: {
            '11111111-1111-4111-8111-111111111111': ['unknown'],
        },
    },
];
it.each(unreadableLimits)(
    'lists unreadable stored limits %j without approximating approvals',
    async (limits) => {
        const f = setup();
        Object.assign(f.grant, { resourceConstraints: limits });
        const { results } = await f.controller.list(f.req);
        expect(results[0]).toMatchObject({
            limitsStatus: 'invalid',
            lastUsedAt: null,
            revokedAt: null,
        });
        expect(results[0].approvedProjects).toEqual([
            {
                projectUuid: f.projectUuid,
                name: 'Visible',
                approvedCapabilities: [],
            },
        ]);
    },
);
it.each(unreadableLimits)(
    'denies every action for unreadable stored limits %j',
    async (limits) => {
        const f = setup();
        Object.assign(f.grant, { resourceConstraints: limits });
        const policy = vi.spyOn(f.permissions, 'assertOperation');
        const { results } = await f.controller.getConnectionStatus(
            f.req,
            'grant',
        );
        expect(results.limitsStatus).toBe('invalid');
        expect(results.effectiveProjects).toEqual([
            {
                projectUuid: f.projectUuid,
                capabilities: Object.values(AgentCapability).map(
                    (capability) => ({
                        capability,
                        allowed: false,
                        reason: 'invalid_grant',
                    }),
                ),
            },
        ]);
        expect(policy).not.toHaveBeenCalled();
    },
);
it.each(unreadableLimits)(
    'revokes and returns unreadable stored limits %j',
    async (limits) => {
        const f = setup();
        Object.assign(f.grant, { resourceConstraints: limits });
        const { results } = await f.controller.revoke(f.req, 'grant');
        expect(results).toMatchObject({
            limitsStatus: 'invalid',
            status: 'revoked',
            revokedAt: expect.any(Date),
        });
        expect(results.approvedProjects[0].approvedCapabilities).toEqual([]);
        expect(f.model.revoke).toHaveBeenCalledOnce();
    },
);
