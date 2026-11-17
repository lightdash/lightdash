import {
    FeatureFlags,
    ID_TOKEN_TYPE,
    LightdashError,
    TOKEN_EXCHANGE_GRANT_TYPE,
} from '@lightdash/common';
import express, {
    type NextFunction,
    type Request,
    type RequestHandler,
    type Response,
} from 'express';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import passport from 'passport';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { MobileOrgDisabledOAuthError } from '../../auth/mobileAppAccess';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { authenticateServiceAccount } from '../../ee/authentication';
import { errorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OAuth2Model } from '../../models/OAuth2Model';
import { type UserModel } from '../../models/UserModel';
import oauthRouter from '../../routers/oauthRouter';
import { type ManagedSignInService } from '../../services/OAuthService/managedSignIn/ManagedSignInService';
import { OAuthService } from '../../services/OAuthService/OAuthService';
import {
    allowApiKeyAuthentication,
    allowOauthAuthentication,
} from './middlewares';

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));
vi.mock('../../models/FeatureFlagModel/flagCheckAggregator', () => ({
    record: vi.fn(),
}));

const disabledOrg = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
const mobileRedirectUri = 'com.lightdash.mobile://oauth/callback';
const codeVerifier = 'verifier-0000-test-0000-test-0000-test-0000-test-00';
const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

const clients: Record<string, { redirect_uris: string[]; grants: string[] }> = {
    'mobile-client': {
        redirect_uris: [mobileRedirectUri],
        grants: ['authorization_code', 'refresh_token'],
    },
    'cli-client': {
        redirect_uris: ['http://localhost:*/callback'],
        grants: ['authorization_code', 'refresh_token'],
    },
    'exchange-client': {
        redirect_uris: ['https://client.example/callback'],
        grants: [TOKEN_EXCHANGE_GRANT_TYPE, 'refresh_token'],
    },
};

type StoredToken = { clientId: string; organizationUuid: string };

const authorizationCodes: Record<string, StoredToken> = {
    'mobile-code': { clientId: 'mobile-client', organizationUuid: disabledOrg },
};

const accessTokens: Record<string, StoredToken> = {
    'mobile-access': {
        clientId: 'mobile-client',
        organizationUuid: disabledOrg,
    },
    'other-org-mobile-access': {
        clientId: 'mobile-client',
        organizationUuid: otherOrg,
    },
    'cli-access': { clientId: 'cli-client', organizationUuid: disabledOrg },
};

const refreshTokens: Record<string, StoredToken> = {
    'mobile-refresh': {
        clientId: 'mobile-client',
        organizationUuid: disabledOrg,
    },
    'cli-refresh': { clientId: 'cli-client', organizationUuid: disabledOrg },
};

const flagState = {
    overrides: new Map<string, boolean>(),
    overrideReads: 0,
    onOverrideRead: undefined as undefined | ((read: number) => void),
};

const config = {
    ...lightdashConfigMock,
    siteUrl: 'https://server.example',
    enabledFeatureFlags: new Set<string>(),
    disabledFeatureFlags: new Set<string>(),
    previewFeatureFlags: { enabled: false },
    auth: {
        ...lightdashConfigMock.auth,
        oauthServer: {
            accessTokenLifetime: 3600,
            refreshTokenLifetime: 86400,
            mobileRefreshTokenLifetime: 86400,
            refreshTokenRotationGrace: 0,
        },
    },
} as LightdashConfig;

const database = knex({ client: MockClient, dialect: 'pg' });
const featureFlagModel = new FeatureFlagModel({
    database,
    lightdashConfig: config,
});
const oauthModel = new OAuth2Model(database, config, featureFlagModel);
const managedSignIn = {
    exchangeIdToken: vi.fn(async () => ({
        ...defaultSessionUser,
        userId: 42,
        organizationUuid: disabledOrg,
    })),
    recordSignInAllowed: vi.fn(),
};
const onMobileAccessDenied = vi.fn(async () => undefined);
const oauthService = new OAuthService({
    lightdashConfig: config,
    userModel: {} as UserModel,
    oauthModel,
    onMobileAccessDenied,
    getManagedSignInService: () =>
        managedSignIn as unknown as ManagedSignInService,
});

const findStored = (
    store: Record<string, StoredToken>,
    bindings: readonly unknown[],
) => {
    const presented = bindings.find(
        (binding): binding is string =>
            typeof binding === 'string' && binding in store,
    );
    return presented === undefined
        ? undefined
        : { presented, ...store[presented] };
};

const registerQueries = (
    tracker: Tracker,
    { flagTableReadable = true }: { flagTableReadable?: boolean } = {},
) => {
    if (flagTableReadable)
        tracker.on.select(/from "feature_flags"/).response(({ bindings }) => ({
            flag_id: bindings[0],
            default_enabled:
                bindings[0] === FeatureFlags.MobileAppAccess ? null : false,
        }));
    tracker.on
        .select(/from "users"/)
        .response({ user_uuid: defaultSessionUser.userUuid });
    tracker.on
        .select(/from "feature_flag_overrides"/)
        .response(({ sql, bindings }) => {
            if (
                bindings[0] !== FeatureFlags.MobileAppAccess ||
                !sql.includes('"user_uuid" is null')
            )
                return undefined;
            const enabled = flagState.overrides.get(bindings[1] as string);
            flagState.overrideReads += 1;
            flagState.onOverrideRead?.(flagState.overrideReads);
            return enabled === undefined ? undefined : { enabled };
        });
    tracker.on
        .select(/from "oauth2_access_tokens"/)
        .response(({ bindings }) => {
            const stored = findStored(accessTokens, bindings);
            if (!stored) return undefined;
            return {
                access_token: stored.presented,
                expires_at: new Date(Date.now() + 60_000),
                scope: ['read', 'write'],
                client_id: stored.clientId,
                ...clients[stored.clientId],
                user_id: 42,
                user_uuid: defaultSessionUser.userUuid,
                organization_uuid: stored.organizationUuid,
                resource: null,
                family_uuid: null,
                agent_connection_grant_uuid: null,
                session_expires_at:
                    stored.clientId === 'cli-client'
                        ? new Date(Date.now() + 60_000)
                        : null,
            };
        });
    tracker.on
        .select(/from "oauth2_refresh_tokens"/)
        .response(({ bindings }) => {
            const stored = findStored(refreshTokens, bindings);
            if (!stored) return undefined;
            return {
                refresh_token: stored.presented,
                expires_at: new Date(Date.now() + 60_000),
                revoked_at: null,
                scope: ['read', 'write'],
                client_id: stored.clientId,
                ...clients[stored.clientId],
                user_id: 42,
                organization_uuid: stored.organizationUuid,
                resource: null,
                family_uuid: null,
                agent_connection_grant_uuid: null,
                session_expires_at:
                    stored.clientId === 'cli-client'
                        ? new Date(Date.now() + 60_000)
                        : null,
            };
        });
    tracker.on
        .select(/from "oauth2_authorization_codes"/)
        .response(({ bindings }) => {
            const stored = findStored(authorizationCodes, bindings);
            if (!stored) return undefined;
            return {
                authorization_code: stored.presented,
                expires_at: new Date(Date.now() + 60_000),
                redirect_uri: mobileRedirectUri,
                scope: ['read', 'write'],
                client_id: stored.clientId,
                ...clients[stored.clientId],
                user_id: 42,
                organization_uuid: stored.organizationUuid,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                resource: null,
                agent_connection_grant_uuid: null,
                session_expires_at: null,
            };
        });
    tracker.on.delete('oauth2_authorization_codes').response(1);
    tracker.on.select(/from "oauth2_clients"/).response(({ bindings }) => {
        const clientId = bindings[0] as string;
        return clients[clientId]
            ? { client_id: clientId, scopes: [], ...clients[clientId] }
            : undefined;
    });
    tracker.on.update('oauth2_refresh_tokens').response(1);
    tracker.on.insert('oauth2_access_tokens').response([]);
    tracker.on.insert('oauth2_refresh_tokens').response([]);
    tracker.on.delete('oauth2_refresh_tokens').response(0);
};

type JsonResponse = { status: number; body: Record<string, unknown> };

const send = (
    url: string,
    options: {
        method?: string;
        headers?: Record<string, string>;
        form?: Record<string, string>;
    } = {},
) =>
    new Promise<JsonResponse>((resolve, reject) => {
        const body = options.form
            ? new URLSearchParams(options.form).toString()
            : undefined;
        const request = httpRequest(
            url,
            {
                method: options.method ?? (body ? 'POST' : 'GET'),
                headers: {
                    ...(body
                        ? {
                              'content-type':
                                  'application/x-www-form-urlencoded',
                              'content-length': String(Buffer.byteLength(body)),
                          }
                        : {}),
                    ...options.headers,
                },
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    resolve({
                        status: response.statusCode ?? 0,
                        body: text.startsWith('{')
                            ? (JSON.parse(text) as Record<string, unknown>)
                            : {},
                    });
                });
            },
        );
        request.on('error', reject);
        request.end(body);
    });

const servers: Server[] = [];

const start = async ({
    middleware = allowApiKeyAuthentication,
    hasSession = false,
}: { middleware?: RequestHandler; hasSession?: boolean } = {}) => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
        req.isAuthenticated = (() => hasSession) as Request['isAuthenticated'];
        req.services = {
            getOauthService: () => oauthService,
            getUserService: () => ({
                findSessionUser: async ({
                    organization,
                }: {
                    organization: string;
                }) => ({
                    ...defaultSessionUser,
                    userId: 42,
                    organizationUuid: organization,
                }),
            }),
            getFeatureFlagService: () => ({
                get: async () => ({ enabled: false }),
            }),
            getAgentPermissionService: () => ({
                loadRequest: async () => ({ enforcementMode: 'off' }),
                assertOperationWithRequest: async () => undefined,
            }),
            getMobileSignInService: () => ({
                getClientAddress: () => '127.0.0.1',
            }),
        } as unknown as Request['services'];
        next();
    });
    app.get('/api/v1/org/projects', middleware, (req, res) => {
        res.status(
            req.account?.isAuthenticated() || hasSession ? 200 : 401,
        ).json({
            status: 'ok',
            authentication: req.account?.authentication.type ?? 'session',
        });
    });
    app.use('/api/v1/oauth', oauthRouter);
    app.use((error: Error, _req: Request, res: Response, _: NextFunction) => {
        const handled: LightdashError = errorHandler(error);
        res.status(handled.statusCode).json({
            status: 'error',
            error: {
                statusCode: handled.statusCode,
                name: handled.name,
                message: handled.message,
                data: handled.data,
            },
        });
    });
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const getProjects = (url: string, token: string) =>
    send(`${url}/api/v1/org/projects`, {
        headers: { Authorization: `Bearer ${token}` },
    });

const refresh = (url: string, refreshToken: string, clientId: string) =>
    send(`${url}/api/v1/oauth/token`, {
        form: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        },
    });

const deniedEnvelope = {
    status: 'error',
    error: {
        statusCode: 401,
        name: 'MobileOrgDisabledError',
        message: "Mobile access isn't enabled for your organisation",
        data: { code: 'mobile_org_disabled', organizationUuid: disabledOrg },
    },
};

let tracker: Tracker;

beforeEach(() => {
    tracker = getTracker();
    registerQueries(tracker);
    flagState.overrides.clear();
    flagState.overrideReads = 0;
    flagState.onOverrideRead = undefined;
    vi.clearAllMocks();
});

afterEach(async () => {
    vi.restoreAllMocks();
    tracker.reset();
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

describe.each([
    ['allowApiKeyAuthentication', allowApiKeyAuthentication],
    ['allowOauthAuthentication', allowOauthAuthentication],
])('a mobile access token through %s', (_name, middleware) => {
    it('works, is denied when the organization goes off, and works again when it goes back on', async () => {
        const url = await start({ middleware });

        expect((await getProjects(url, 'mobile-access')).status).toBe(200);

        flagState.overrides.set(disabledOrg, false);
        const denied = await getProjects(url, 'mobile-access');
        expect(denied.status).toBe(401);
        expect(denied.body).toEqual(deniedEnvelope);

        flagState.overrides.set(disabledOrg, true);
        expect((await getProjects(url, 'mobile-access')).status).toBe(200);

        flagState.overrides.set(disabledOrg, false);
        expect((await getProjects(url, 'mobile-access')).status).toBe(401);

        flagState.overrides.delete(disabledOrg);
        expect((await getProjects(url, 'mobile-access')).status).toBe(200);
    });

    it('does not fall back to a service account or a personal access token', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start({ middleware });

        expect((await getProjects(url, 'mobile-access')).status).toBe(401);
        expect(authenticateServiceAccount).not.toHaveBeenCalled();
        expect(passport.authenticate).not.toHaveBeenCalled();
    });

    it('is denied even when a browser session cookie comes with it', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start({ middleware, hasSession: true });

        const denied = await getProjects(url, 'mobile-access');
        expect(denied.status).toBe(401);
        expect(denied.body).toEqual(deniedEnvelope);
    });

    it('leaves another organization, a non-mobile client and a web session alone', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start({ middleware });
        const webUrl = await start({ middleware, hasSession: true });

        expect((await getProjects(url, 'other-org-mobile-access')).status).toBe(
            200,
        );
        expect((await getProjects(url, 'cli-access')).status).toBe(200);
        const web = await send(`${webUrl}/api/v1/org/projects`);
        expect(web.status).toBe(200);
        expect(web.body.authentication).toBe('session');
    });

    it('never names another organization in the denial', async () => {
        flagState.overrides.set(disabledOrg, false);
        flagState.overrides.set(otherOrg, false);
        const url = await start({ middleware });

        const denied = await getProjects(url, 'other-org-mobile-access');
        expect(denied.status).toBe(401);
        expect(JSON.stringify(denied.body)).toContain(otherOrg);
        expect(JSON.stringify(denied.body)).not.toContain(disabledOrg);
        expect(JSON.stringify(denied.body)).not.toContain(
            defaultSessionUser.organizationName,
        );
    });

    it('stays allowed when the flag read fails, as every flag does', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        flagState.overrides.set(disabledOrg, false);
        tracker.reset();
        registerQueries(tracker, { flagTableReadable: false });
        const url = await start({ middleware });

        expect((await getProjects(url, 'mobile-access')).status).toBe(200);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                `Failed to check feature flag ${FeatureFlags.MobileAppAccess} from database`,
            ),
        );
    });
});

describe('the token endpoint for a mobile client', () => {
    it('denies refresh with invalid_grant and does not use up the refresh token', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        const denied = await refresh(url, 'mobile-refresh', 'mobile-client');

        expect(denied.status).toBe(400);
        expect(denied.body).toEqual({
            error: 'invalid_grant',
            error_description: 'mobile_org_disabled',
            organization_uuid: disabledOrg,
        });
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('refreshes again after the organization is turned back on', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();
        expect(
            (await refresh(url, 'mobile-refresh', 'mobile-client')).status,
        ).toBe(400);

        flagState.overrides.set(disabledOrg, true);
        const refreshed = await refresh(url, 'mobile-refresh', 'mobile-client');

        expect(refreshed.status).toBe(200);
        expect(refreshed.body.token_type).toBe('Bearer');
        expect(refreshed.body.access_token).toEqual(expect.any(String));
    });

    it('issues no token when the organization goes off between the refresh check and the save', async () => {
        flagState.onOverrideRead = (read) => {
            if (read === 1) flagState.overrides.set(disabledOrg, false);
        };
        const url = await start();

        const denied = await refresh(url, 'mobile-refresh', 'mobile-client');

        expect(denied.status).toBe(403);
        expect(denied.body).toEqual({
            error: 'access_denied',
            error_description: 'mobile_org_disabled',
            organization_uuid: disabledOrg,
        });
        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(1);
    });

    it('still refreshes a non-mobile client of the same organization', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        const refreshed = await refresh(url, 'cli-refresh', 'cli-client');

        expect(refreshed.status).toBe(200);
        expect(refreshed.body.access_token).toEqual(expect.any(String));
    });

    it('still revokes a refresh token of a disabled organization', async () => {
        flagState.overrides.set(disabledOrg, false);
        tracker.on.delete('oauth2_access_tokens').response(0);
        const url = await start();

        const revoked = await send(`${url}/api/v1/oauth/revoke`, {
            form: { token: 'mobile-refresh' },
        });

        expect(revoked.status).toBe(200);
    });
});

describe('the other grants for a mobile client', () => {
    const exchangeCode = (url: string) =>
        send(`${url}/api/v1/oauth/token`, {
            form: {
                grant_type: 'authorization_code',
                code: 'mobile-code',
                redirect_uri: mobileRedirectUri,
                client_id: 'mobile-client',
                code_verifier: codeVerifier,
            },
        });
    const exchangeIdToken = (url: string, clientId: string) =>
        send(`${url}/api/v1/oauth/token`, {
            form: {
                grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
                subject_token: 'a-microsoft-id-token',
                subject_token_type: ID_TOKEN_TYPE,
                scope: 'read',
                client_id: clientId,
            },
        });
    const denied = {
        error: 'access_denied',
        error_description: 'mobile_org_disabled',
        organization_uuid: disabledOrg,
    };

    it('issues no token for an authorization code of a disabled organization', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        const response = await exchangeCode(url);

        expect(response.status).toBe(403);
        expect(response.body).toEqual(denied);
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('exchanges an authorization code for an enabled organization', async () => {
        const url = await start();

        const response = await exchangeCode(url);

        expect(response.status).toBe(200);
        expect(response.body.access_token).toEqual(expect.any(String));
    });

    it('issues no token for a Microsoft ID token of a disabled organization', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        const response = await exchangeIdToken(url, 'mobile-client');

        expect(response.status).toBe(403);
        expect(response.body).toEqual(denied);
        expect(tracker.history.insert).toHaveLength(0);
        expect(managedSignIn.recordSignInAllowed).not.toHaveBeenCalled();
    });

    it('exchanges a Microsoft ID token for an enabled organization', async () => {
        const url = await start();

        const response = await exchangeIdToken(url, 'mobile-client');

        expect(response.status).toBe(200);
        expect(response.body.access_token).toEqual(expect.any(String));
        expect(managedSignIn.recordSignInAllowed).toHaveBeenCalledTimes(1);
    });

    it('refuses the Microsoft ID token exchange for a client that is not a mobile app', async () => {
        const url = await start();

        const response = await exchangeIdToken(url, 'exchange-client');

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.body.error).toBe('unauthorized_client');
        expect(managedSignIn.exchangeIdToken).not.toHaveBeenCalled();
        expect(tracker.history.insert).toHaveLength(0);
    });
});

describe('the push installations of a denied grant', () => {
    const deniedGrant = {
        userId: 42,
        clientId: 'mobile-client',
        organizationUuid: disabledOrg,
    };

    it('are reported for removal when a mobile access token is denied', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        expect((await getProjects(url, 'mobile-access')).status).toBe(401);

        expect(onMobileAccessDenied).toHaveBeenCalledTimes(1);
        expect(onMobileAccessDenied).toHaveBeenCalledWith(deniedGrant);
    });

    it('are reported for removal when a refresh is denied', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        expect(
            (await refresh(url, 'mobile-refresh', 'mobile-client')).status,
        ).toBe(400);

        expect(onMobileAccessDenied).toHaveBeenCalledWith(deniedGrant);
    });

    it('are reported for removal when the switch races a token save', async () => {
        flagState.onOverrideRead = (read) => {
            if (read === 1) flagState.overrides.set(disabledOrg, false);
        };
        const url = await start();

        expect(
            (await refresh(url, 'mobile-refresh', 'mobile-client')).status,
        ).toBe(403);

        expect(onMobileAccessDenied).toHaveBeenCalledWith(deniedGrant);
    });

    it('are left alone for an enabled organization, another organization and a non-mobile client', async () => {
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        await getProjects(url, 'other-org-mobile-access');
        await getProjects(url, 'cli-access');
        await refresh(url, 'cli-refresh', 'cli-client');
        flagState.overrides.delete(disabledOrg);
        await getProjects(url, 'mobile-access');
        await refresh(url, 'mobile-refresh', 'mobile-client');

        expect(onMobileAccessDenied).not.toHaveBeenCalled();
    });

    it('are left alone when the browser authorize step is refused', async () => {
        flagState.overrides.set(disabledOrg, false);

        await expect(
            oauthService.isMobileAppAccessDenied('mobile-client', disabledOrg),
        ).resolves.toBe(true);

        expect(onMobileAccessDenied).not.toHaveBeenCalled();
    });

    it('do not change the denial when the removal fails', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        onMobileAccessDenied.mockRejectedValueOnce(new Error('database down'));
        flagState.overrides.set(disabledOrg, false);
        const url = await start();

        const denied = await getProjects(url, 'mobile-access');

        expect(denied.status).toBe(401);
        expect(denied.body).toEqual(deniedEnvelope);
        expect(warn).toHaveBeenCalledWith(
            'Unable to remove mobile push installations of a denied grant',
            expect.anything(),
        );
    });
});

describe('OAuthService.isMobileAppAccessDenied', () => {
    it('is true only for a mobile client of a disabled organization', async () => {
        flagState.overrides.set(disabledOrg, false);

        await expect(
            oauthService.isMobileAppAccessDenied('mobile-client', disabledOrg),
        ).resolves.toBe(true);
        await expect(
            oauthService.isMobileAppAccessDenied('mobile-client', otherOrg),
        ).resolves.toBe(false);
        await expect(
            oauthService.isMobileAppAccessDenied('cli-client', disabledOrg),
        ).resolves.toBe(false);
        await expect(
            oauthService.isMobileAppAccessDenied('unknown-client', disabledOrg),
        ).resolves.toBe(false);
    });

    it('is false again when the organization is turned back on', async () => {
        flagState.overrides.set(disabledOrg, true);

        await expect(
            oauthService.isMobileAppAccessDenied('mobile-client', disabledOrg),
        ).resolves.toBe(false);
    });
});

describe('OAuth2Model.saveToken for a mobile client', () => {
    const token = {
        accessToken: 'new-access',
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
        refreshToken: 'new-refresh',
        refreshTokenExpiresAt: new Date(Date.now() + 120_000),
        scope: ['read'],
    };
    const mobileClient = {
        id: 'mobile-client',
        grants: ['authorization_code'],
        redirectUris: [mobileRedirectUri],
    };

    it('refuses every grant for a disabled organization and writes nothing', async () => {
        flagState.overrides.set(disabledOrg, false);

        const saved = oauthModel.saveToken(
            { ...token, client: mobileClient, user: {} },
            mobileClient,
            { userId: 42, organizationUuid: disabledOrg },
        );

        await expect(saved).rejects.toBeInstanceOf(MobileOrgDisabledOAuthError);
        await expect(saved).rejects.toMatchObject({
            code: 403,
            name: 'access_denied',
            organizationUuid: disabledOrg,
        });
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('saves a token for an organization with no override', async () => {
        await expect(
            oauthModel.saveToken(
                { ...token, client: mobileClient, user: {} },
                mobileClient,
                { userId: 42, organizationUuid: disabledOrg },
            ),
        ).resolves.toMatchObject({ accessToken: 'new-access' });
        expect(tracker.history.insert).toHaveLength(2);
    });
});
