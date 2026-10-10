import {
    AnyType,
    AuthorizationError,
    FeatureFlags,
    TOKEN_EXCHANGE_GRANT_TYPE,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import { isMobileOAuthClient, OAuth2Model } from './OAuth2Model';

const lightdashConfig = {
    auth: {
        oauthServer: {
            accessTokenLifetime: 60 * 60,
            refreshTokenLifetime: 60 * 60 * 24 * 14,
            mobileRefreshTokenLifetime: 60 * 60 * 24 * 90,
            refreshTokenRotationGrace: 60,
        },
    },
} as LightdashConfig;

const featureFlagModel = { get: vi.fn<FeatureFlagModel['get']>() };

beforeEach(() => {
    featureFlagModel.get.mockResolvedValue({ enabled: false } as Awaited<
        ReturnType<FeatureFlagModel['get']>
    >);
    getTracker()
        .on.select(/from "users"/)
        .response({ user_uuid: 'user-uuid' });
});

const mobileRedirectUri = 'com.lightdash.mobile://oauth/callback';
const cliRedirectUri = 'http://localhost:*/callback';

describe('OAuth2Model.validateRedirectUri', () => {
    const model = new OAuth2Model(
        {} as AnyType,
        lightdashConfig,
        featureFlagModel,
    );
    const client = {
        redirectUris: [
            'http://localhost:8100/callback',
            'http://localhost:*/callback',
            'https://example.com/*',
        ],
    };

    it.each([
        ['http://localhost:53682/callback', true],
        ['http://localhost:80/callback', true],
        ['http://localhost/callback', false],
        ['http://localhost:/callback', false],
        ['http://localhost:53682/other', false],
        ['http://localhost:8080@evil.example/callback', false],
        ['http://user:pass@localhost:8080/callback', false],
        ['http://@localhost:8080/callback', false],
        ['http://localhost:8080\\@evil.example/callback', false],
        ['http:\\\\evil.example/callback', false],
        ['http://localhost.evil.example:8080/callback', false],
        ['http://evil.example:8080/callback', false],
        ['https://localhost:53682/callback', false],
        ['http://localhost:99999/callback', false],
    ])('validates CLI redirect %s as %s', async (candidate, expected) => {
        expect(
            await model.validateRedirectUri(candidate, {
                redirectUris: [cliRedirectUri],
            } as AnyType),
        ).toBe(expected);
    });

    it.each([
        ['https://app.example.com/a/b/c?x=1', true],
        ['https://APP.EXAMPLE.COM/a/b/c?x=1', true],
        ['https://evil.example/a', false],
        ['https://app.example.com.evil.example/a', false],
        ['https://app.example.com@evil.example/a', false],
        ['http://app.example.com/a', false],
    ])('validates wildcard path %s as %s', async (candidate, expected) => {
        expect(
            await model.validateRedirectUri(candidate, {
                redirectUris: ['https://app.example.com/*'],
            } as AnyType),
        ).toBe(expected);
    });

    it.each([
        ['https://app.example.com/callback', true],
        ['https://app.example.com/callback/', false],
        ['https://APP.EXAMPLE.COM/callback', false],
        ['https://app.example.com/Callback', false],
        ['https://app.example.com/callback?x=1', false],
    ])('validates exact redirect %s as %s', async (candidate, expected) => {
        expect(
            await model.validateRedirectUri(candidate, {
                redirectUris: ['https://app.example.com/callback'],
            } as AnyType),
        ).toBe(expected);
    });

    it.each([
        ['https://app.example.com/callback', true],
        ['https://APP-1.Example.com/callback', true],
        ['https://a.b.example.com/callback', false],
        ['https://evil.com/.example.com/callback', false],
        ['https://example.com/callback', false],
        ['https://app.example.com@evil.com/callback', false],
        ['https://app.example.com.evil.com/callback', false],
        ['http://app.example.com/callback', false],
        ['https://app.example.com/other', false],
        ['https://app_1.example.com/callback', false],
        ['https://.example.com/callback', false],
        ['https://app.example.com:8443/callback', false],
        ['https://app.example.com\\@evil.com/callback', false],
    ])('validates wildcard host %s as %s', async (candidate, expected) => {
        expect(
            await model.validateRedirectUri(candidate, {
                redirectUris: ['https://*.example.com/callback'],
            } as AnyType),
        ).toBe(expected);
    });

    it.each([
        ['https://a*.example.com/callback', 'https://ab.example.com/callback'],
        [
            'https://app.*.example.com/callback',
            'https://app.x.example.com/callback',
        ],
        ['https://*example.com/callback', 'https://evilexample.com/callback'],
        ['https://*/callback', 'https://evil.com/callback'],
        ['*://app.example.com/cb', 'https://app.example.com/cb'],
        ['https://*@app.example.com/cb', 'https://user@app.example.com/cb'],
        ['https://app.example.com/cb#*', 'https://app.example.com/cb#value'],
    ])(
        'rejects unsupported wildcard pattern %s',
        async (registered, candidate) => {
            expect(
                await model.validateRedirectUri(candidate, {
                    redirectUris: [registered],
                } as AnyType),
            ).toBe(false);
        },
    );

    it.each([
        'com.lightdash.mobile:/oauth/callback',
        mobileRedirectUri,
        'cursor://anysphere.cursor-retrieval/oauth/callback',
    ])('accepts exact custom scheme redirect %s', async (candidate) => {
        expect(
            await model.validateRedirectUri(candidate, {
                redirectUris: [candidate],
            } as AnyType),
        ).toBe(true);
    });

    it.each([
        'not a URL',
        'http:@localhost/callback',
        'http:////@localhost/callback',
        'http://user:pass@localhost:8080/callback',
        'http://@localhost:8080/callback',
        'http://localhost:8080\\@evil.example/callback',
        'http:\\\\evil.example/callback',
    ])(
        'rejects unsafe candidates even when registered exactly: %s',
        async (candidate) => {
            expect(
                await model.validateRedirectUri(candidate, {
                    redirectUris: [candidate],
                } as AnyType),
            ).toBe(false);
        },
    );

    it('matches query wildcards without treating regex characters as wildcards', async () => {
        const queryClient = {
            redirectUris: ['https://app.example.com/callback?next=*'],
        } as AnyType;
        expect(
            await model.validateRedirectUri(
                'https://app.example.com/callback?next=/a/b',
                queryClient,
            ),
        ).toBe(true);
        expect(
            await model.validateRedirectUri(
                'https://app.example.com/callbackXnext=/a/b',
                queryClient,
            ),
        ).toBe(false);
    });

    it('returns true for exact match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:9999/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard path match', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com/anything',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns false for non-wildcard port uri', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com:8100/anything',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for non-matching uri', async () => {
        const result = await model.validateRedirectUri(
            'http://malicious.com/callback',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for partial match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/other',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('accepts an exact registered redirect URI with a query', async () => {
        const redirectUri = 'https://client.example/callback?flow=oauth';
        await expect(
            model.validateRedirectUri(redirectUri, {
                id: 'client',
                grants: ['authorization_code'],
                redirectUris: [redirectUri],
            }),
        ).resolves.toBe(true);
    });

    it.each([
        ['host', 'https://other.example/callback?flow=oauth'],
        ['path', 'https://client.example/other?flow=oauth'],
        ['query', 'https://client.example/callback?flow=other'],
    ])(
        'rejects a redirect URI with a different %s',
        async (_part, redirectUri) => {
            await expect(
                model.validateRedirectUri(redirectUri, {
                    id: 'client',
                    grants: ['authorization_code'],
                    redirectUris: [
                        'https://client.example/callback?flow=oauth',
                    ],
                }),
            ).resolves.toBe(false);
        },
    );

    it('accepts a loopback port for the seeded CLI redirect pattern', async () => {
        await expect(
            model.validateRedirectUri('http://localhost:53682/callback', {
                id: 'lightdash-cli',
                grants: ['authorization_code'],
                redirectUris: [cliRedirectUri],
            }),
        ).resolves.toBe(true);
    });

    it('matches userinfo authority escape (documents current hole)', async () => {
        // flips when the wildcard fix lands
        await expect(
            model.validateRedirectUri(
                'http://localhost:8080@evil.example/callback',
                {
                    id: 'lightdash-cli',
                    grants: ['authorization_code'],
                    redirectUris: [cliRedirectUri],
                },
            ),
        ).resolves.toBe(true);
    });
});

describe('isMobileOAuthClient', () => {
    it.each([
        [[mobileRedirectUri], true],
        [['COM.LIGHTDASH.MOBILE://oauth/callback'], true],
        [[cliRedirectUri, mobileRedirectUri], true],
        [[cliRedirectUri], false],
        [['https://com.lightdash.mobile/callback'], false],
        [[], false],
    ] as [string[], boolean][])(
        'reads %j as mobile=%s',
        (redirectUris, expected) => {
            expect(isMobileOAuthClient(redirectUris)).toBe(expected);
        },
    );

    it('reads an absent redirect uri list as not mobile', () => {
        expect(isMobileOAuthClient(null)).toBe(false);
        expect(isMobileOAuthClient(undefined)).toBe(false);
    });
});

describe('OAuth2Model refresh token rotation', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OAuth2Model(
        database as unknown as Knex,
        lightdashConfig,
        featureFlagModel,
    );
    let tracker: Tracker;

    const refreshTokenRow = (overrides: Record<string, unknown> = {}) => ({
        refresh_token: 'refresh-token',
        expires_at: new Date('2026-12-01T00:00:00.000Z'),
        revoked_at: null,
        scope: ['read'],
        client_id: 'oauth-mobile',
        redirect_uris: [mobileRedirectUri],
        grants: ['authorization_code', 'refresh_token'],
        user_id: 42,
        organization_uuid: 'organization-uuid',
        ...overrides,
    });

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('marks a rotated refresh token revoked instead of deleting it', async () => {
        tracker.on.update('oauth2_refresh_tokens').responseOnce(1);

        const revoked = await model.revokeToken({
            refreshToken: 'refresh-token',
            user: { userId: 42, organizationUuid: 'organization-uuid' },
        } as AnyType);

        expect(revoked).toBe(true);
        expect(tracker.history.delete).toHaveLength(0);
        expect(tracker.history.update[0].sql).toContain(
            'coalesce(revoked_at, now())',
        );
    });

    it('keeps the first revocation timestamp when a client retries', async () => {
        tracker.on.update('oauth2_refresh_tokens').response(1);

        await model.revokeToken({
            refreshToken: 'refresh-token',
            user: { userId: 42, organizationUuid: 'organization-uuid' },
        } as AnyType);
        await model.revokeToken({
            refreshToken: 'refresh-token',
            user: { userId: 42, organizationUuid: 'organization-uuid' },
        } as AnyType);

        expect(tracker.history.update).toHaveLength(2);
        tracker.history.update.forEach((query) => {
            expect(query.sql).toContain('coalesce(revoked_at, now())');
        });
    });

    it('accepts a refresh token revoked inside the grace window', async () => {
        tracker.on.select('oauth2_refresh_tokens').responseOnce(
            refreshTokenRow({
                revoked_at: new Date(Date.now() - 10 * 1000),
            }),
        );

        const token = await model.getRefreshToken('refresh-token');

        expect(token).not.toBe(false);
        expect(token && token.refreshToken).toBe('refresh-token');
    });

    it('rejects a refresh token revoked before the grace window', async () => {
        tracker.on.select('oauth2_refresh_tokens').responseOnce(
            refreshTokenRow({
                revoked_at: new Date(Date.now() - 10 * 60 * 1000),
            }),
        );

        const token = await model.getRefreshToken('refresh-token');

        expect(token).toBe(false);
    });

    it('deletes a refresh token outright when a user revokes it', async () => {
        tracker.on.delete('oauth2_refresh_tokens').responseOnce(1);

        const deleted = await model.deleteRefreshToken('refresh-token');

        expect(deleted).toBe(true);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete[0].bindings).toContain('refresh-token');
    });

    it('deletes an access token outright when a user revokes it', async () => {
        tracker.on.delete('oauth2_access_tokens').responseOnce(1);

        const deleted = await model.deleteAccessToken('access-token');

        expect(deleted).toBe(true);
        expect(tracker.history.delete[0].bindings).toContain('access-token');
    });

    it('removes expired and long revoked tokens of the same user on save', async () => {
        tracker.on.insert('oauth2_access_tokens').responseOnce([]);
        tracker.on.insert('oauth2_refresh_tokens').responseOnce([]);
        tracker.on.delete('oauth2_refresh_tokens').responseOnce(2);

        await model.saveToken(
            {
                accessToken: 'access-token',
                accessTokenExpiresAt: new Date('2026-12-01T00:00:00.000Z'),
                refreshToken: 'new-refresh-token',
                refreshTokenExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
                scope: ['read'],
            } as AnyType,
            { id: 'oauth-mobile' } as AnyType,
            {
                userId: 42,
                organizationUuid: 'organization-uuid',
            } as AnyType,
        );

        expect(tracker.history.delete).toHaveLength(1);
        const housekeeping = tracker.history.delete[0];
        expect(housekeeping.sql).toContain('"user_id" = $1');
        expect(housekeeping.sql).toContain('"expires_at" < CURRENT_TIMESTAMP');
        expect(housekeeping.sql).toBe(
            'delete from "oauth2_refresh_tokens" where "user_id" = $1 and ("expires_at" < CURRENT_TIMESTAMP or "revoked_at" < now() - interval \'1 day\')',
        );
        expect(housekeeping.bindings).toEqual([42]);
    });
});

describe('OAuth2Model mobile refresh token lifetime', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OAuth2Model(
        database as unknown as Knex,
        lightdashConfig,
        featureFlagModel,
    );
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('gives a mobile client the long refresh token lifetime', async () => {
        tracker.on.select('oauth2_clients').responseOnce({
            client_id: 'oauth-mobile',
            redirect_uris: [mobileRedirectUri],
            grants: ['authorization_code', 'refresh_token'],
        });

        const client = await model.getClient('oauth-mobile');

        expect(client && client.refreshTokenLifetime).toBe(60 * 60 * 24 * 90);
    });

    it('leaves a non-mobile client on the server default', async () => {
        tracker.on.select('oauth2_clients').responseOnce({
            client_id: 'lightdash-cli',
            redirect_uris: [cliRedirectUri],
            grants: ['authorization_code', 'refresh_token'],
        });

        const client = await model.getClient('lightdash-cli');

        expect(client && client.refreshTokenLifetime).toBeUndefined();
    });

    it('reports the mobile lifetime on the refresh token client', async () => {
        tracker.on.select('oauth2_refresh_tokens').responseOnce({
            refresh_token: 'refresh-token',
            expires_at: new Date('2026-12-01T00:00:00.000Z'),
            revoked_at: null,
            scope: ['read'],
            client_id: 'oauth-mobile',
            redirect_uris: [mobileRedirectUri],
            grants: ['authorization_code', 'refresh_token'],
            user_id: 42,
            organization_uuid: 'organization-uuid',
        });

        const token = await model.getRefreshToken('refresh-token');

        expect(token && token.client.refreshTokenLifetime).toBe(
            60 * 60 * 24 * 90,
        );
    });
});

describe('OAuth2Model.getClient token exchange grant', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OAuth2Model(
        database as unknown as Knex,
        lightdashConfig,
        featureFlagModel,
    );
    let tracker: Tracker;

    const clientRow = (redirectUris: string[]) => ({
        client_id: 'client-id',
        client_secret: null,
        redirect_uris: redirectUris,
        grants: ['authorization_code', 'refresh_token'],
        scopes: ['read'],
        client_name: 'Client',
    });

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('grants token exchange to a mobile client', async () => {
        tracker.on
            .select('oauth2_clients')
            .responseOnce(clientRow([mobileRedirectUri]));

        const client = await model.getClient('client-id');

        expect(client && client.grants).toEqual([
            'authorization_code',
            'refresh_token',
            TOKEN_EXCHANGE_GRANT_TYPE,
        ]);
    });

    it('does not grant token exchange to a non-mobile client', async () => {
        tracker.on
            .select('oauth2_clients')
            .responseOnce(clientRow([cliRedirectUri]));

        const client = await model.getClient('client-id');

        expect(client && client.grants).toEqual([
            'authorization_code',
            'refresh_token',
        ]);
    });

    it('does not repeat the grant when it is already stored', async () => {
        tracker.on.select('oauth2_clients').responseOnce({
            ...clientRow([mobileRedirectUri]),
            grants: ['refresh_token', TOKEN_EXCHANGE_GRANT_TYPE],
        });

        const client = await model.getClient('client-id');

        expect(client && client.grants).toEqual([
            'refresh_token',
            TOKEN_EXCHANGE_GRANT_TYPE,
        ]);
    });
});

describe('OAuth2Model.validateScope', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OAuth2Model(database, lightdashConfig, featureFlagModel);
    const user = { userId: 42, organizationUuid: 'organization-uuid' };
    const client = {
        id: 'client-id',
        grants: ['authorization_code'],
        scopes: ['read'],
    };
    let tracker: Tracker;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        featureFlagModel.get.mockReset();
        tracker.on.select(/from "users"/).response({ user_uuid: 'user-uuid' });
        warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    });

    afterEach(() => {
        tracker.reset();
        warn.mockRestore();
    });

    const setFlags = (agentIdentity: boolean, enforcement: boolean) => {
        featureFlagModel.get.mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? agentIdentity
                    : enforcement,
        }));
    };

    it('rejects a missing user before resolving flags', async () => {
        tracker.reset();
        tracker.on.select(/from "users"/).responseOnce(undefined);
        await expect(
            model.validateScope(user, client, ['read']),
        ).rejects.toBeInstanceOf(AuthorizationError);
        expect(featureFlagModel.get).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('passes through all requested scopes when agent identity is off', async () => {
        setFlags(false, true);
        const scopes = ['unknown', 'write'];
        await expect(model.validateScope(user, client, scopes)).resolves.toBe(
            scopes,
        );
        expect(featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
            featureFlagId: FeatureFlags.AgentIdentity,
            user: {
                organizationUuid: user.organizationUuid,
                userUuid: 'user-uuid',
            },
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it.each(['unknown', 'write'])(
        'logs and passes through disallowed %s scope',
        async (scope) => {
            setFlags(true, false);
            const scopes = [scope];
            await expect(
                model.validateScope(user, client, scopes),
            ).resolves.toBe(scopes);
            expect(warn).toHaveBeenCalledExactlyOnceWith(
                'oauth_scope_refusal',
                {
                    mode: 'log',
                    clientId: client.id,
                    scopes,
                    method: null,
                    routeTemplate: null,
                    toolName: null,
                    action: 'validateScope',
                    subjectType: 'OAuthClient',
                },
            );
        },
    );

    it.each(['unknown', 'write'])(
        'refuses disallowed %s scope in enforce mode',
        async (scope) => {
            setFlags(true, true);
            await expect(
                model.validateScope(user, client, [scope]),
            ).resolves.toBe(false);
            expect(warn).toHaveBeenCalledExactlyOnceWith(
                'oauth_scope_refusal',
                {
                    mode: 'enforce',
                    clientId: client.id,
                    scopes: [scope],
                    method: null,
                    routeTemplate: null,
                    toolName: null,
                    action: 'validateScope',
                    subjectType: 'OAuthClient',
                },
            );
        },
    );

    it.each([
        [['read'], ['read']],
        [['write'], ['read', 'write']],
        [['mcp:read'], ['mcp:read', 'mcp:write']],
        [['mcp:write'], ['mcp:write']],
        [
            ['read', 'mcp:read'],
            ['read', 'mcp:read', 'write'],
        ],
        [['read', 'write', 'mcp:read', 'mcp:write'], []],
    ])(
        'accepts known subset %j of registered %j',
        async (scopes, registeredScopes) => {
            setFlags(true, true);
            await expect(
                model.validateScope(
                    user,
                    { ...client, scopes: registeredScopes },
                    scopes,
                ),
            ).resolves.toEqual(scopes);
            expect(warn).not.toHaveBeenCalled();
        },
    );

    it.each([null, 'log', 'enforce'])(
        'keeps omitted and empty scopes empty in %s mode',
        async (mode) => {
            setFlags(mode !== null, mode === 'enforce');
            await expect(
                model.validateScope(user, client, []),
            ).resolves.toEqual([]);
            await expect(model.validateScope(user, client)).resolves.toEqual(
                [],
            );
            expect(warn).not.toHaveBeenCalled();
        },
    );

    it('does not accept an unknown scope even when it is registered', async () => {
        setFlags(true, true);
        await expect(
            model.validateScope(user, { ...client, scopes: ['unknown'] }, [
                'unknown',
            ]),
        ).resolves.toBe(false);
    });

    it('does not log user or client secrets', async () => {
        setFlags(true, false);
        const userWithSecret = { ...user, password: 'user-secret' };
        await model.validateScope(
            userWithSecret,
            {
                ...client,
                clientSecret: 'client-secret',
                redirectUris: ['https://example.com/?secret=private'],
            },
            ['write', 'https://example.test/?token=secret'],
        );
        expect(warn).toHaveBeenCalledWith(
            'oauth_scope_refusal',
            expect.objectContaining({ scopes: ['write', 'unknown'] }),
        );
        const record = JSON.stringify(warn.mock.calls);
        expect(record).not.toContain('https://example.test/?token=secret');
        expect(record).not.toContain('user-secret');
        expect(record).not.toContain('client-secret');
        expect(record).not.toContain('private');
        expect(record).not.toContain('organization-uuid');
        expect(record).not.toContain('user-uuid');
    });

    it('exposes the client registered scopes for grant validation', async () => {
        tracker.on.select('oauth2_clients').responseOnce({
            client_id: client.id,
            redirect_uris: [],
            grants: client.grants,
            scopes: client.scopes,
        });
        await expect(model.getClient(client.id)).resolves.toMatchObject({
            scopes: client.scopes,
        });
    });

    it('applies Console organisation overrides without ENV or preview defaults and rechecks each grant', async () => {
        const config = {
            ...lightdashConfigMock,
            enabledFeatureFlags: new Set<string>(),
            disabledFeatureFlags: new Set<string>(),
            previewFeatureFlags: { enabled: false },
        };
        const realFlags = new FeatureFlagModel({
            database,
            lightdashConfig: config,
        });
        const modelWithRealFlags = new OAuth2Model(database, config, realFlags);
        let enforce = true;
        let identity = true;
        tracker.on.select('feature_flags').response(({ bindings }) => ({
            flag_id: bindings[0],
            default_enabled: false,
        }));
        tracker.on.select('feature_flag_overrides').response(({ bindings }) => {
            if (!bindings.includes(user.organizationUuid)) return undefined;
            return {
                enabled: bindings.includes(FeatureFlags.AgentIdentity)
                    ? identity
                    : enforce,
            };
        });

        await expect(
            modelWithRealFlags.validateScope(user, client, ['write']),
        ).resolves.toBe(false);
        enforce = false;
        await expect(
            modelWithRealFlags.validateScope(user, client, ['write']),
        ).resolves.toEqual(['write']);
        expect(warn).toHaveBeenCalledTimes(2);
        identity = false;
        await expect(
            modelWithRealFlags.validateScope(user, client, ['write']),
        ).resolves.toEqual(['write']);
        expect(warn).toHaveBeenCalledTimes(2);
        identity = true;
        enforce = true;
        await expect(
            modelWithRealFlags.validateScope(user, client, ['write']),
        ).resolves.toBe(false);
        expect(warn).toHaveBeenCalledTimes(3);
        await expect(
            modelWithRealFlags.validateScope(
                { ...user, organizationUuid: 'other-organization' },
                client,
                ['write'],
            ),
        ).resolves.toEqual(['write']);
        expect(warn).toHaveBeenCalledTimes(3);
    });
});

describe('OAuth2Model resource storage', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OAuth2Model(database, lightdashConfig, featureFlagModel);
    afterEach(() => getTracker().reset());

    it.each([null, 'https://server.example/api/v1/mcp'])(
        'persists resource %s on codes and both tokens',
        async (resource) => {
            const tracker = getTracker();
            tracker.on.insert('oauth2_authorization_codes').response([]);
            tracker.on.insert('oauth2_access_tokens').response([]);
            tracker.on.insert('oauth2_refresh_tokens').response([]);
            tracker.on.delete('oauth2_refresh_tokens').response(0);
            const client = { id: 'client', grants: ['authorization_code'] };
            const user = { userId: 42, organizationUuid: 'org' };
            const code = await model.saveAuthorizationCode(
                {
                    authorizationCode: 'code',
                    expiresAt: new Date(),
                    redirectUri: 'https://client.example',
                    resource,
                },
                client,
                user,
            );
            expect(code.resource).toBe(resource);
            await model.saveToken(
                {
                    accessToken: 'access',
                    refreshToken: 'refresh',
                    client,
                    user,
                    resource,
                },
                client,
                user,
            );
            expect(tracker.history.insert).toHaveLength(3);
            tracker.history.insert.forEach((query) => {
                expect(query.sql).toContain('"resource"');
                expect(query.bindings).toContain(resource);
                if (!query.sql.includes('authorization_codes')) {
                    expect(query.sql).toContain('"family_uuid"');
                    expect(query.bindings).toContain(null);
                }
            });
        },
    );

    it.each([null, 'https://server.example/api/v1/mcp'])(
        'returns stored resource %s from all credential lookups',
        async (resource) => {
            const tracker = getTracker();
            const row = {
                authorization_code: 'code',
                access_token: 'access',
                refresh_token: 'refresh',
                expires_at: new Date(Date.now() + 60000),
                revoked_at: null,
                redirect_uri: 'https://client.example',
                client_id: 'client',
                user_id: 42,
                organization_uuid: 'org',
                resource,
                family_uuid: null,
            };
            tracker.on.select('oauth2_authorization_codes').response(row);
            tracker.on.select('oauth2_access_tokens').response(row);
            tracker.on.select('oauth2_refresh_tokens').response(row);
            expect(await model.getAuthorizationCode('code')).toMatchObject({
                resource,
            });
            expect(await model.getAccessToken('access')).toMatchObject({
                resource,
            });
            expect(await model.getRefreshToken('refresh')).toMatchObject({
                resource,
            });
        },
    );
});

describe('OAuth2Model strict refresh rotation', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const flags = {
        get: vi.fn(
            async ({
                featureFlagId,
            }: Parameters<FeatureFlagModel['get']>[0]) => ({
                id: featureFlagId,
                enabled: true,
            }),
        ),
    };
    const model = new OAuth2Model(database, lightdashConfig, flags);
    const user = { userId: 42, organizationUuid: 'org' };
    const client = { id: 'client', grants: ['refresh_token'] };
    const familyUuid = '11111111-1111-4111-8111-111111111111';
    const parent = {
        accessToken: '',
        refreshToken: 'secret-parent-token',
        familyUuid,
        client,
        user,
    };
    beforeEach(() => {
        const tracker = getTracker();
        tracker.on.select(/from "users"/).response({ user_uuid: 'user-uuid' });
        tracker.on.select('pg_advisory_xact_lock').response([]);
        vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    });
    afterEach(() => {
        getTracker().reset();
        vi.restoreAllMocks();
    });
    it('consumes a strict parent only when it is not revoked', async () => {
        const tracker = getTracker();
        tracker.on.update('oauth2_refresh_tokens').responseOnce(1);
        await expect(model.revokeToken(parent)).resolves.toBe(true);
        expect(tracker.history.update[0].sql).toContain('"revoked_at" is null');
        expect(tracker.history.update[0].sql).not.toContain('coalesce');
        expect(tracker.history.transactions[0].queries[0].sql).toContain(
            'pg_advisory_xact_lock',
        );
    });
    it('commits family revocation when atomic consumption loses the race', async () => {
        const tracker = getTracker();
        tracker.on.update('oauth2_refresh_tokens').responseOnce(0);
        tracker.on
            .select('oauth2_refresh_tokens')
            .responseOnce({ family_uuid: familyUuid });
        tracker.on.update('oauth2_refresh_tokens').responseOnce(2);
        tracker.on.delete('oauth2_access_tokens').responseOnce(2);
        await expect(model.revokeToken(parent)).resolves.toBe(false);
        expect(tracker.history.update[1].sql).toContain(
            'coalesce(revoked_at, now())',
        );
        expect(tracker.history.update[1].bindings).toEqual([familyUuid]);
        expect(tracker.history.delete[0].bindings).toEqual([familyUuid]);
        expect(
            tracker.history.transactions.every(
                (transaction) => transaction.state === 'committed',
            ),
        ).toBe(true);
        expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
            'oauth_refresh_token_reuse',
            { clientId: client.id, userUuid: null, familyUuid, reason: 'race' },
        );
        expect(JSON.stringify(vi.mocked(Logger.warn).mock.calls)).not.toContain(
            'secret-parent-token',
        );
    });
    it.each([1000, 2 * 86400000])(
        'refuses revoked family tokens after %s ms and commits revocation',
        async (age) => {
            const tracker = getTracker();
            tracker.on.select('oauth2_refresh_tokens').responseOnce({
                refresh_token: parent.refreshToken,
                family_uuid: familyUuid,
                revoked_at: new Date(Date.now() - age),
                expires_at: new Date(Date.now() + 60000),
                client_id: client.id,
                user_id: user.userId,
                organization_uuid: user.organizationUuid,
            });
            tracker.on.update('oauth2_refresh_tokens').response(2);
            tracker.on.delete('oauth2_access_tokens').response(2);
            await expect(
                model.getRefreshToken(parent.refreshToken!),
            ).resolves.toBe(false);
            expect(tracker.history.transactions[0].state).toBe('committed');
            expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
                'oauth_refresh_token_reuse',
                expect.objectContaining({ reason: 'reused', familyUuid }),
            );
        },
    );
    it('refuses revoked legacy tokens without a family action', async () => {
        const tracker = getTracker();
        tracker.on.select('oauth2_refresh_tokens').responseOnce({
            refresh_token: parent.refreshToken,
            family_uuid: null,
            revoked_at: new Date(),
            client_id: client.id,
            user_id: user.userId,
            organization_uuid: user.organizationUuid,
        });
        await expect(model.getRefreshToken(parent.refreshToken!)).resolves.toBe(
            false,
        );
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
        expect(Logger.warn).not.toHaveBeenCalled();
    });
    it('rolls back parent consumption when saving the child fails', async () => {
        const tracker = getTracker();
        tracker.on.update('oauth2_refresh_tokens').responseOnce(1);
        tracker.on.insert('oauth2_access_tokens').responseOnce([]);
        tracker.on
            .insert('oauth2_refresh_tokens')
            .simulateErrorOnce('insert failed');
        await expect(
            model.saveToken(
                {
                    accessToken: 'child-access',
                    refreshToken: 'child-refresh',
                    parentRefreshToken: parent.refreshToken,
                    familyUuid,
                    client,
                    user,
                },
                client,
                user,
            ),
        ).rejects.toThrow('insert failed');
        const transaction = tracker.history.transactions[0];
        expect(transaction.state).toBe('rolled back');
        expect(transaction.queries.map((query) => query.method)).toEqual([
            'select',
            'update',
            'insert',
            'insert',
        ]);
        expect(Logger.warn).not.toHaveBeenCalled();
    });
    it('commits race revocation before saveToken throws invalid_grant', async () => {
        const tracker = getTracker();
        tracker.on.update('oauth2_refresh_tokens').responseOnce(0);
        tracker.on
            .select('oauth2_refresh_tokens')
            .responseOnce({ family_uuid: familyUuid });
        tracker.on.update('oauth2_refresh_tokens').responseOnce(2);
        tracker.on.delete('oauth2_access_tokens').responseOnce(2);
        await expect(
            model.saveToken(
                {
                    accessToken: 'child-access',
                    refreshToken: 'child-refresh',
                    parentRefreshToken: parent.refreshToken,
                    familyUuid,
                    client,
                    user,
                },
                client,
                user,
            ),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
        expect(tracker.history.transactions[0].state).toBe('committed');
        expect(tracker.history.insert).toHaveLength(0);
    });
    it('keeps revoked family rows until they expire', async () => {
        const tracker = getTracker();
        tracker.on.insert('oauth2_access_tokens').response([]);
        tracker.on.insert('oauth2_refresh_tokens').response([]);
        tracker.on.delete('oauth2_refresh_tokens').response(0);
        await model.saveToken(
            {
                accessToken: 'access',
                refreshToken: 'refresh',
                familyUuid,
                client,
                user,
            },
            client,
            user,
        );
        const housekeeping = tracker.history.delete[0];
        expect(housekeeping.sql).toContain('"expires_at" < CURRENT_TIMESTAMP');
        expect(housekeeping.sql).toContain(
            '"family_uuid" is null and "revoked_at" <',
        );
        expect(housekeeping.sql).toContain("now() - interval '1 day'");
        tracker.history.insert.forEach((query) =>
            expect(query.bindings).toContain(familyUuid),
        );
    });
});
