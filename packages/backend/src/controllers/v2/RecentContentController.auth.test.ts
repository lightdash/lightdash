import { LightdashError } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import express, {
    type ErrorRequestHandler,
    type Request,
    type RequestHandler,
} from 'express';
import { once } from 'node:events';
import { request as httpRequest, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import path from 'node:path';
import passport from 'passport';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import {
    collectOAuthRoutes,
    parseSource,
} from '../../auth/oauthScopes/testing/routeInventory';
import { authenticateServiceAccount } from '../../ee/authentication';
import { allowOauthAuthentication, isAuthenticated } from '../authentication';
import { RecentContentController } from './RecentContentController';

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));

const site = 'https://server.example';
const recentlyViewedPath = '/api/v2/content/recently-viewed';
const user = {
    ...defaultSessionUser,
    userId: 42,
    userUuid: 'user',
    organizationUuid: 'org',
};
const tokens: Record<string, OAuth2Server.Token> = {
    'mobile-token': {
        accessToken: 'mobile-token',
        resource: site,
        scope: ['read', 'write'],
        client: { id: 'mobile-client', grants: ['authorization_code'] },
        user,
    },
    'cli-token': {
        accessToken: 'cli-token',
        resource: null,
        scope: ['read', 'write'],
        client: { id: 'lightdash-cli', grants: ['authorization_code'] },
        user,
    },
    'mcp-token': {
        accessToken: 'mcp-token',
        resource: null,
        scope: ['mcp:read', 'mcp:write'],
        client: { id: 'mcp-client', grants: ['authorization_code'] },
        user,
    },
    'mcp-bound-token': {
        accessToken: 'mcp-bound-token',
        resource: `${site}/api/v1/mcp`,
        scope: ['mcp:read', 'mcp:write'],
        client: { id: 'mcp-client', grants: ['authorization_code'] },
        user,
    },
};
const recordView = vi.fn();
const services = {
    getOauthService: () => ({
        authenticate: async (request: OAuth2Server.Request) => {
            const bearer = /^Bearer (\S+)$/.exec(
                String(request.headers?.authorization ?? ''),
            )?.[1];
            const token = bearer === undefined ? undefined : tokens[bearer];
            if (!token) throw new Error('not an OAuth token');
            return token;
        },
        getSiteUrl: () => site,
        isMobileClient: async (clientId: string) =>
            clientId === 'mobile-client',
    }),
    getUserService: () => ({ findSessionUser: async () => user }),
    getFeatureFlagService: () => ({ get: async () => ({ enabled: false }) }),
    getAgentPermissionService: () => ({
        loadRequest: async () => ({ enforcementMode: 'off' }),
        assertOperationWithRequest: vi.fn(),
    }),
    getRecentContentService: () => ({ recordView }),
};
const controller = new RecentContentController(
    services as unknown as ConstructorParameters<
        typeof RecentContentController
    >[0],
);
const view = {
    projectUuid: 'project',
    contentType: 'dashboard',
    contentUuid: 'dashboard',
};

const servers: Server[] = [];
const start = async (session: boolean) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.isAuthenticated = (() => session) as Request['isAuthenticated'];
        if (session) req.account = buildAccount();
        req.services = services as unknown as Request['services'];
        next();
    });
    const handler: RequestHandler = (req, res, next) => {
        controller
            .recordView(req, req.body)
            .then((body) => res.json(body))
            .catch(next);
    };
    app.post(
        recentlyViewedPath,
        allowOauthAuthentication,
        isAuthenticated,
        handler,
    );
    const onError: ErrorRequestHandler = (error, _req, res, _next) => {
        res.status(
            error instanceof LightdashError ? error.statusCode : 500,
        ).json({ error: error.name });
    };
    app.use(onError);
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const post = (url: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
        const body = JSON.stringify(view);
        const request = httpRequest(
            url,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
            },
            (response) => {
                response.resume();
                response.on('end', () => resolve(response.statusCode ?? 0));
            },
        );
        request.on('error', reject);
        request.end(body);
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

it('authenticates the write with session or OAuth only, and keeps the read session-only', () => {
    const routes = collectOAuthRoutes(
        parseSource(path.join(__dirname, 'RecentContentController.ts')),
    );
    expect(
        routes.map((route) => [route.id, route.authentication.getText()]),
    ).toEqual([
        ['RecentContentController.recordView', 'allowOauthAuthentication'],
    ]);
});

it('records a view sent with a mobile app OAuth token', async () => {
    const url = await start(false);
    await expect(
        post(`${url}${recentlyViewedPath}`, {
            Authorization: 'Bearer mobile-token',
        }),
    ).resolves.toBe(200);
    expect(recordView).toHaveBeenCalledWith(
        expect.objectContaining({ userUuid: 'user' }),
        view,
    );
});

it('records a view sent with a browser session', async () => {
    const url = await start(true);
    await expect(post(`${url}${recentlyViewedPath}`, {})).resolves.toBe(200);
    expect(recordView).toHaveBeenCalledWith(
        expect.objectContaining({ userUuid: defaultSessionUser.userUuid }),
        view,
    );
});

it.each([
    ['no credentials', {}, 401],
    ['a personal access token', { Authorization: 'ApiKey ldpat_x' }, 401],
    ['a service account token', { Authorization: 'Bearer ldsvc_x' }, 401],
    ['an embed token', { 'Lightdash-Embed-Token': 'embed.jwt.token' }, 401],
    [
        'an MCP-bound OAuth token',
        { Authorization: 'Bearer mcp-bound-token' },
        401,
    ],
    ['a CLI OAuth token', { Authorization: 'Bearer cli-token' }, 403],
    ['an MCP client OAuth token', { Authorization: 'Bearer mcp-token' }, 403],
])('refuses a view sent with %s', async (_name, headers, status) => {
    const url = await start(false);
    await expect(post(`${url}${recentlyViewedPath}`, headers)).resolves.toBe(
        status,
    );
    expect(recordView).not.toHaveBeenCalled();
    expect(passport.authenticate).not.toHaveBeenCalled();
    expect(authenticateServiceAccount).not.toHaveBeenCalled();
});
