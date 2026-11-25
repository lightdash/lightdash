import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
} from '@lightdash/common';
import express, {
    type ErrorRequestHandler,
    type Request,
    type RequestHandler,
} from 'express';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { type AddressInfo } from 'node:net';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import { PersonalAccessTokenService } from '../../services/PersonalAccessTokenService';
import { UserController } from '../userController';
import { allowOauthAuthentication, isAuthenticated } from './middlewares';

vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));
vi.mock('../../logging/logger', () => ({
    default: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        child: vi.fn(() => ({
            warn: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
        })),
    },
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const path = '/api/v1/user/me/personal-access-tokens';

const user = {
    ...defaultSessionUser,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
};

beforeEach(() => vi.clearAllMocks());

const post = async ({
    clientId = 'lightdash-cli',
    scopes = ['read', 'write'],
    session = false,
}: { clientId?: string; scopes?: string[]; session?: boolean } = {}) => {
    const create = vi.fn(async (_user, data) => ({
        uuid: 'pat-uuid',
        token: 'pat-token',
        ...data,
    }));
    const pat = new PersonalAccessTokenService({
        lightdashConfig: lightdashConfigMock,
        analytics: { track: vi.fn() },
        personalAccessTokenModel: { create },
        featureFlagModel: { get: vi.fn(async () => ({ enabled: false })) },
    } as unknown as ConstructorParameters<
        typeof PersonalAccessTokenService
    >[0]);
    const services = {
        getOauthService: () => ({
            isAccessTokenBoundToGrant: vi.fn().mockResolvedValue(false),
            authenticate: async () => ({
                accessToken: 'secret-token',
                scope: scopes,
                client: { id: clientId },
                user,
            }),
        }),
        getUserService: () => ({ findSessionUser: async () => user }),
        getAgentPermissionService: () => ({
            loadRequest: vi.fn().mockResolvedValue({ enforcementMode: 'off' }),
            assertOperationWithRequest: vi.fn(),
        }),
        getPersonalAccessTokenService: () => pat,
    } as unknown as Request['services'];
    const controller = new UserController(services);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.services = services;
        req.isAuthenticated = (() => session) as Request['isAuthenticated'];
        if (session) {
            req.user = user;
            req.account = fromSession(user);
        }
        next();
    });
    const handler: RequestHandler = (req, res, next) => {
        controller
            .createPersonalAccessToken(req, req.body)
            .then((result) => res.json(result))
            .catch(next);
    };
    Object.defineProperty(handler, 'name', {
        value: 'UserController_createPersonalAccessToken',
    });
    app.post(path, allowOauthAuthentication, isAuthenticated, handler);
    const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
        res.sendStatus(error instanceof ForbiddenError ? 403 : 500);
    };
    app.use(errors);
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const status = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(
                {
                    hostname: '127.0.0.1',
                    port: (server.address() as AddressInfo).port,
                    path,
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'user-agent':
                            'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
                        ...(session
                            ? {}
                            : { authorization: 'Bearer secret-token' }),
                    },
                },
                (response) => {
                    response.resume();
                    response.on('end', () => resolve(response.statusCode ?? 0));
                },
            );
            request.on('error', reject);
            request.end(
                JSON.stringify({
                    expiresAt: new Date(
                        Date.now() + 365 * DAY_MS,
                    ).toISOString(),
                    description: 'Generated by OAuth on 2026-12-01',
                    autoGenerated: true,
                }),
            );
        });
        return { status, create };
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
};

it('creates a 7-day token for old CLI browser login over the PAT route', async () => {
    const before = Date.now();
    const { status, create } = await post();
    expect(status).toBe(200);
    const { expiresAt } = create.mock.calls[0][1] as { expiresAt: Date };
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);
    expect(Logger.warn).toHaveBeenCalledWith(
        'oauth_cli_pat_compat_used',
        expect.objectContaining({
            clientId: 'lightdash-cli',
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
            cliVersion: null,
        }),
    );
});

it.each([
    ['a read-only CLI token', { scopes: ['read'] }],
    ['another client', { clientId: 'mcp-lightdashcli' }],
])('refuses %s over the PAT route', async (_name, opts) => {
    const { status, create } = await post(opts);
    expect(status).toBe(403);
    expect(create).not.toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalledWith(
        'oauth_credential_mint_refused',
        expect.objectContaining({ operation: 'createPersonalAccessToken' }),
    );
});

it('leaves session PAT creation unchanged over the PAT route', async () => {
    const { status, create } = await post({ session: true });
    expect(status).toBe(200);
    const { expiresAt } = create.mock.calls[0][1] as { expiresAt: string };
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(
        Date.now() + 300 * DAY_MS,
    );
    expect(Logger.warn).not.toHaveBeenCalled();
});
