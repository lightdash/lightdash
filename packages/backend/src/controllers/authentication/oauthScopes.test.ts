import { Ability, subject } from '@casl/ability';
import {
    AbilityAction,
    CaslSubjectNames,
    FeatureFlags,
    ForbiddenError,
    PossibleAbilities,
} from '@lightdash/common';
import express, { ErrorRequestHandler, Request } from 'express';
import { request as httpRequest, Server } from 'http';
import { AddressInfo } from 'net';
import passport from 'passport';
import { fromServiceAccount, fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { lightdashConfig } from '../../config/lightdashConfig';
import { authenticateServiceAccount } from '../../ee/authentication';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import Logger from '../../logging/logger';
import {
    allowApiKeyAuthentication,
    allowOauthAuthentication,
} from './middlewares';

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));

vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));
vi.mock('../../logging/logger', () => ({
    default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const operations: {
    path: string;
    method: 'GET' | 'POST';
    action: AbilityAction;
    subjectType: CaslSubjectNames;
    read: boolean;
}[] = [
    {
        path: '/org/projects',
        method: 'GET',
        action: 'view',
        subjectType: 'Project',
        read: true,
    },
    {
        path: '/org/users',
        method: 'GET',
        action: 'view',
        subjectType: 'OrganizationMemberProfile',
        read: true,
    },
    {
        path: '/org/invite',
        method: 'POST',
        action: 'manage',
        subjectType: 'Organization',
        read: false,
    },
    {
        path: '/projects/:projectUuid/charts',
        method: 'POST',
        action: 'manage',
        subjectType: 'SavedChart',
        read: false,
    },
    {
        path: '/projects/:projectUuid/charts/create',
        method: 'POST',
        action: 'create',
        subjectType: 'SavedChart',
        read: false,
    },
    {
        path: '/projects/:projectUuid/query',
        method: 'POST',
        action: 'manage',
        subjectType: 'Explore',
        read: true,
    },
];
const servers: Server[] = [];

const sendRequest = (
    url: string,
    options: { method: string; headers: Record<string, string> },
) =>
    new Promise<{ status: number }>((resolve, reject) => {
        const request = httpRequest(url, options, (response) => {
            response.resume();
            response.on('end', () =>
                resolve({ status: response.statusCode ?? 0 }),
            );
        });
        request.on('error', reject);
        request.end();
    });
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve, reject) => {
                    server.closeAllConnections();
                    server.close((error) =>
                        error ? reject(error) : resolve(),
                    );
                }),
        ),
    );
});

const start = async (
    agentIdentity: boolean,
    enforcement: boolean,
    scopes: string[],
    oauthOnly = false,
    authentication: 'oauth' | 'pat' | 'session' | 'service-account' = 'oauth',
) => {
    const ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const user = {
        ...defaultSessionUser,
        ability,
        abilityRules: ability.rules,
    };
    const getFlag = vi.fn(
        async ({ featureFlagId }: { featureFlagId: string }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? agentIdentity
                    : enforcement,
        }),
    );
    lightdashConfig.auth.pat.enabled = true;
    vi.mocked(passport.authenticate).mockReturnValue(
        (req: Request, _res: express.Response, next: express.NextFunction) => {
            req.user = user;
            next();
        },
    );
    vi.mocked(authenticateServiceAccount).mockImplementation(
        (req, _res, next) => {
            if (authentication === 'service-account') {
                const serviceUser = {
                    ...user,
                    serviceAccount: { uuid: 'service', description: 'service' },
                };
                req.user = serviceUser;
                req.account = fromServiceAccount(serviceUser, 'service-token');
            }
            next();
        },
    );
    const app = express();
    app.use((req, _res, next) => {
        req.isAuthenticated = (() =>
            authentication === 'session' ||
            req.account?.authentication.type ===
                'service-account') as Request['isAuthenticated'];
        if (authentication === 'session') {
            req.user = user;
            req.account = fromSession(user);
        }
        req.services = {
            getOauthService: () => ({
                authenticate: async () => {
                    if (authentication !== 'oauth')
                        throw new Error('Not an OAuth token');
                    return {
                        accessToken: 'secret-token',
                        scope: scopes,
                        client: { id: 'client' },
                        user,
                    };
                },
            }),
            getUserService: () => ({ findSessionUser: async () => user }),
            getFeatureFlagService: () => ({ get: getFlag }),
            getAgentPermissionService: () => ({
                isManaged: vi.fn().mockResolvedValue(false),
                assertOperation: vi.fn(),
            }),
        } as unknown as Request['services'];
        next();
    });
    operations.forEach((operation) => {
        app[operation.method === 'GET' ? 'get' : 'post'](
            operation.path,
            oauthOnly ? allowOauthAuthentication : allowApiKeyAuthentication,
            (req, res, next) => {
                expect(req.user!.ability).toBe(req.account!.user.ability);
                const audited = new CaslAuditWrapper(
                    req.account!.user.ability,
                    req.account!,
                    { auditEnabled: false },
                );
                if (
                    audited.cannot(
                        operation.action,
                        subject(operation.subjectType, {
                            organizationUuid: 'org',
                            projectUuid: 'project',
                            metadata: { secret: 'private-data' },
                        }),
                    )
                ) {
                    next(new ForbiddenError());
                    return;
                }
                res.sendStatus(200);
            },
        );
    });
    const errorHandler: ErrorRequestHandler = (
        error: unknown,
        _req,
        res,
        _next,
    ) => {
        res.sendStatus(error instanceof ForbiddenError ? 403 : 500);
    };
    app.use(errorHandler);
    const server = await new Promise<Server>((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    servers.push(server);
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        user,
        getFlag,
    };
};

describe.each([
    { agentIdentity: false, enforcement: false, mode: null },
    { agentIdentity: false, enforcement: true, mode: null },
    { agentIdentity: true, enforcement: false, mode: 'log' },
    { agentIdentity: true, enforcement: true, mode: 'enforce' },
])(
    'OAuth REST permissions $mode (flags $agentIdentity/$enforcement)',
    ({ agentIdentity, enforcement, mode }) => {
        it.each(
            [
                { scopes: [] as string[] },
                { scopes: ['read'] },
                { scopes: ['write'] },
                { scopes: ['mcp:read'] },
                { scopes: ['mcp:write'] },
                { scopes: ['mcp:read', 'write'] },
            ].flatMap(({ scopes }) =>
                operations.map((operation) => ({ scopes, operation })),
            ),
        )(
            '$operation.method $operation.path with scopes $scopes',
            async ({ scopes, operation }) => {
                const { url, user, getFlag } = await start(
                    agentIdentity,
                    enforcement,
                    scopes,
                );
                vi.mocked(Logger.warn).mockClear();
                const scopedAllowed =
                    scopes.includes('write') ||
                    scopes.includes('mcp:write') ||
                    (scopes.length > 0 && operation.read);
                const response = await sendRequest(
                    `${url}${operation.path.replace(':projectUuid', 'private-project')}?token=private-query`,
                    {
                        method: operation.method,
                        headers: { authorization: 'Bearer secret-token' },
                    },
                );
                expect(response.status).toBe(
                    mode === 'enforce' && !scopedAllowed ? 403 : 200,
                );
                expect(Logger.warn).toHaveBeenCalledTimes(
                    mode !== null && !scopedAllowed ? 1 : 0,
                );
                if (mode !== null && !scopedAllowed) {
                    expect(Logger.warn).toHaveBeenCalledWith(
                        'oauth_scope_refusal',
                        {
                            mode,
                            clientId: 'client',
                            scopes,
                            method: operation.method,
                            routeTemplate: operation.path,
                            toolName: null,
                            action: operation.action,
                            subjectType: operation.subjectType,
                        },
                    );
                }
                expect(user.ability.can('manage', 'Organization')).toBe(true);
                if (!agentIdentity)
                    expect(
                        getFlag.mock.calls.every(
                            ([args]) =>
                                args.featureFlagId ===
                                FeatureFlags.AgentIdentity,
                        ),
                    ).toBe(true);
            },
        );
    },
);

it('applies the same scope restriction on OAuth-only authentication', async () => {
    const { url } = await start(true, true, ['mcp:read'], true);
    const response = await sendRequest(`${url}/org/invite`, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token' },
    });
    expect(response.status).toBe(403);
});

describe.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
])('non-OAuth middleware with flags %s/%s', (agentIdentity, enforcement) => {
    it.each(['pat', 'session', 'service-account'] as const)(
        'leaves %s permissions unchanged without resolving flags',
        async (authentication) => {
            const { url, getFlag } = await start(
                agentIdentity,
                enforcement,
                [],
                false,
                authentication,
            );
            const response = await sendRequest(`${url}/org/invite`, {
                method: 'POST',
                headers: { authorization: 'Bearer other-token' },
            });
            expect(response.status).toBe(200);
            expect(getFlag).not.toHaveBeenCalled();
            expect(Logger.warn).not.toHaveBeenCalled();
        },
    );
});
