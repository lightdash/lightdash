import { Ability } from '@casl/ability';
import {
    AgentCapability,
    FeatureFlags,
    InvalidUser,
    NotFoundError,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { AgentConnectionApprovalRequestError } from '../../models/AgentConnectionApprovalRequestModel';
import { AgentConnectionApprovalService } from './AgentConnectionApprovalService';

const body = {
    clientId: 'lightdash-cli' as const,
    name: 'work-laptop',
    projects: null,
    capabilities: Object.values(AgentCapability),
    expiresInSeconds: 86400,
    redirectUri: 'http://localhost:32123/callback',
    state: 's'.repeat(43),
    codeChallenge: 'c'.repeat(43),
    codeChallengeMethod: 'S256' as const,
    resource: 'https://instance.example/subpath',
};
const account = fromSession(defaultSessionUser, 'session');
const projectUuid = '11111111-1111-4111-8111-111111111111';
const fixture = () => {
    const deps = {
        siteUrl: 'https://instance.example/subpath/',
        model: {
            insertPending: vi.fn().mockResolvedValue({
                agent_connection_approval_request_uuid: projectUuid,
                request_expires_at: new Date('2026-10-12T12:15:00Z'),
            }),
        },
        userModel: {
            findSessionUserAndOrgByUuid: vi
                .fn()
                .mockResolvedValue(defaultSessionUser),
        },
        projectModel: {
            getAllByOrganizationUuid: vi
                .fn()
                .mockResolvedValue([
                    { projectUuid, name: 'Visible', slug: 'visible' },
                ]),
        },
        oauthModel: {
            getClient: vi.fn().mockResolvedValue({
                id: 'lightdash-cli',
                grants: ['authorization_code', 'refresh_token'],
                redirectUris: ['http://localhost/callback'],
            }),
            validateRedirectUriStrict: vi.fn().mockResolvedValue(true),
        },
        featureFlags: { get: vi.fn().mockResolvedValue({ enabled: true }) },
    };
    const service = new AgentConnectionApprovalService(deps as never);
    return { deps, service };
};

it('stores only validated protocol data and returns the canonical pending contract', async () => {
    const { deps, service } = fixture();
    expect(await service.request(account, body)).toEqual({
        authorizationUrl: `https://instance.example/subpath/api/v1/oauth/authorize?agent_request=${projectUuid}`,
        issuer: body.resource,
        resource: body.resource,
        expiresAt: '2026-10-12T12:15:00.000Z',
    });
    expect(deps.model.insertPending).toHaveBeenCalledExactlyOnceWith({
        organizationUuid: defaultSessionUser.organizationUuid,
        subjectUserUuid: defaultSessionUser.userUuid,
        clientId: body.clientId,
        name: body.name,
        redirectUri: body.redirectUri,
        state: body.state,
        codeChallenge: body.codeChallenge,
        resource: body.resource,
        requestedProjects: null,
        requestedCapabilities: body.capabilities,
        expiresInSeconds: body.expiresInSeconds,
    });
    expect(deps.featureFlags.get.mock.calls).toEqual([
        [
            {
                featureFlagId: FeatureFlags.AgentIdentity,
                user: defaultSessionUser,
            },
        ],
        [
            {
                featureFlagId: FeatureFlags.AgentIdentity,
                user: { organizationUuid: defaultSessionUser.organizationUuid },
            },
        ],
    ]);
});

it.each([
    { clientId: 'other' },
    { clientId: null },
    { name: 'Work laptop' },
    { name: '' },
    { name: 'x'.repeat(65) },
    { name: '_x' },
    { state: 's'.repeat(21) },
    { state: 's'.repeat(513) },
    { state: 'a+'.repeat(22) },
    { codeChallenge: 'c'.repeat(42) },
    { codeChallenge: 'c'.repeat(44) },
    { codeChallenge: '+'.repeat(43) },
    { codeChallengeMethod: 'plain' },
    { expiresInSeconds: 0 },
    { expiresInSeconds: 604801 },
    { expiresInSeconds: 1.5 },
    { expiresInSeconds: '1' },
    { resource: `${body.resource}/` },
    { resource: `${body.resource}/api/v1/mcp` },
    { resource: 'https://evil.example' },
    { redirectUri: 'http://localhost/callback' },
    { redirectUri: 'http://localhost:0/callback' },
    { redirectUri: 'http://localhost:65536/callback' },
    { redirectUri: 'http://localhost:*/callback' },
    { redirectUri: 'https://localhost:32123/callback' },
    { redirectUri: 'http://localhost:32123/elsewhere' },
    { redirectUri: 'http://user@localhost:32123/callback' },
    { redirectUri: 'http://localhost:32123/callback?x=1' },
    { redirectUri: 'http://localhost:32123/callback#x' },
    { redirectUri: 'http://localhost:32123/call\nback' },
    { redirectUri: 'http://evil.example:32123/callback' },
    { redirectUri: 'x'.repeat(2049) },
    { projects: [] },
    { projects: [' leading'] },
    { projects: ['trailing '] },
    { projects: ['a/b'] },
    { projects: ['a\\b'] },
    { projects: ['a\u0000b'] },
    { projects: ['x'.repeat(256)] },
    { capabilities: ['unknown'] },
    { capabilities: [AgentCapability.Query, AgentCapability.Query] },
    { organizationUuid: 'attacker' },
    { codeVerifier: 'verifier-sentinel' },
    { token: 'pat-sentinel' },
])('refuses malformed input without inserting: %j', async (patch) => {
    const { deps, service } = fixture();
    await expect(
        service.request(account, { ...body, ...patch } as never),
    ).rejects.toMatchObject({ code: 'invalid_approval_request' });
    expect(deps.model.insertPending).not.toHaveBeenCalled();
});

it.each([1, 604800])(
    'accepts duration boundary %s and an empty capability selection',
    async (expiresInSeconds) => {
        const { service } = fixture();
        await expect(
            service.request(account, {
                ...body,
                expiresInSeconds,
                capabilities: [],
            }),
        ).resolves.toBeDefined();
    },
);

it('deduplicates project UUIDs after resolving visible slugs in the organisation', async () => {
    const { service, deps } = fixture();
    await service.request(account, {
        ...body,
        projects: ['visible', projectUuid],
    });
    expect(
        deps.projectModel.getAllByOrganizationUuid,
    ).toHaveBeenCalledExactlyOnceWith(defaultSessionUser.organizationUuid);
    expect(deps.model.insertPending).toHaveBeenCalledWith(
        expect.objectContaining({ requestedProjects: [projectUuid] }),
    );
});

it.each(['unknown', 'inaccessible'])(
    'does not leak a %s project name',
    async (kind) => {
        const { service, deps } = fixture();
        if (kind === 'inaccessible')
            deps.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                ...defaultSessionUser,
                ability: new Ability(),
            });
        await expect(
            service.request(account, {
                ...body,
                projects: [kind === 'unknown' ? 'secret-name' : 'visible'],
            }),
        ).rejects.toMatchObject({
            code: 'invalid_approval_request',
            message: 'Invalid approval request.',
        });
        expect(deps.model.insertPending).not.toHaveBeenCalled();
    },
);

it('rejects more than 500 requested projects with its specific code', async () => {
    const { service } = fixture();
    await expect(
        service.request(account, {
            ...body,
            projects: Array.from({ length: 501 }, (_, i) => `project-${i}`),
        }),
    ).rejects.toMatchObject({ code: 'too_many_projects' });
});

it.each([0, 1])(
    'requires the subject and organisation flag: disabled lookup %s',
    async (index) => {
        const { service, deps } = fixture();
        deps.featureFlags.get.mockImplementation(async () => ({
            enabled: deps.featureFlags.get.mock.calls.length !== index + 1,
        }));
        await expect(service.request(account, body)).rejects.toMatchObject({
            code: 'agent_identity_disabled',
        });
        expect(deps.model.insertPending).not.toHaveBeenCalled();
    },
);

it.each(['inactive', 'wrong-user', 'wrong-org', 'missing'])(
    'refuses a %s person',
    async (kind) => {
        const { service, deps } = fixture();
        deps.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
            ...defaultSessionUser,
            ...(kind === 'inactive' ? { isActive: false } : {}),
            ...(kind === 'wrong-user' ? { userUuid: 'other' } : {}),
            ...(kind === 'wrong-org' ? { organizationUuid: 'other' } : {}),
        });
        if (kind === 'missing')
            deps.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
                new NotFoundError('secret person'),
            );
        await expect(service.request(account, body)).rejects.toMatchObject({
            code: 'approval_forbidden',
        });
        expect(deps.model.insertPending).not.toHaveBeenCalled();
    },
);

it.each(['missing-client', 'wrong-grants', 'unregistered-redirect'])(
    'refuses %s',
    async (kind) => {
        const { service, deps } = fixture();
        if (kind === 'missing-client')
            deps.oauthModel.getClient.mockResolvedValue(false as never);
        if (kind === 'wrong-grants')
            deps.oauthModel.getClient.mockResolvedValue({
                id: 'lightdash-cli',
                grants: ['authorization_code'],
                redirectUris: ['http://localhost/callback'],
            });
        if (kind === 'unregistered-redirect')
            deps.oauthModel.validateRedirectUriStrict.mockResolvedValue(false);
        await expect(service.request(account, body)).rejects.toMatchObject({
            code: 'invalid_approval_request',
        });
        expect(deps.model.insertPending).not.toHaveBeenCalled();
    },
);

it('preserves the model pending limit error and retry delay', async () => {
    const { service, deps } = fixture();
    deps.model.insertPending.mockRejectedValue(
        new AgentConnectionApprovalRequestError('pending_request_limit', 123),
    );
    await expect(service.request(account, body)).rejects.toMatchObject({
        code: 'pending_request_limit',
        retryAfterSeconds: 123,
    });
});

it('fails closed when the flag lookup fails', async () => {
    const { service, deps } = fixture();
    deps.featureFlags.get.mockRejectedValue(new Error('flag unavailable'));
    await expect(service.request(account, body)).rejects.toThrow(
        'flag unavailable',
    );
    expect(deps.model.insertPending).not.toHaveBeenCalled();
});

it.each([
    { name: 'work-laptop\n' },
    { state: `${'s'.repeat(22)}\n` },
    { codeChallenge: `${'c'.repeat(42)}\n` },
    { redirectUri: 'http://localhost:32123/callback\n' },
])(
    'rejects trailing line endings without normalizing wire data: %j',
    async (patch) => {
        const { service, deps } = fixture();
        await expect(
            service.request(account, { ...body, ...patch }),
        ).rejects.toMatchObject({ code: 'invalid_approval_request' });
        expect(deps.model.insertPending).not.toHaveBeenCalled();
    },
);

it('resolves a UUID by identity even when a different project has that slug', async () => {
    const { service, deps } = fixture();
    deps.projectModel.getAllByOrganizationUuid.mockResolvedValue([
        {
            projectUuid: '22222222-2222-4222-8222-222222222222',
            slug: projectUuid,
            name: 'Different project',
        },
        { projectUuid, slug: 'visible', name: 'Visible' },
    ]);
    await service.request(account, { ...body, projects: [projectUuid] });
    expect(deps.model.insertPending).toHaveBeenCalledWith(
        expect.objectContaining({ requestedProjects: [projectUuid] }),
    );
});

it('maps a missing person from the real UserModel error class to approval_forbidden', async () => {
    const { service, deps } = fixture();
    deps.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
        new InvalidUser('private user and organisation'),
    );
    await expect(service.request(account, body)).rejects.toMatchObject({
        code: 'approval_forbidden',
    });
    expect(deps.model.insertPending).not.toHaveBeenCalled();
});
