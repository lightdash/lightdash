import {
    FeatureFlags,
    ID_TOKEN_TYPE,
    TOKEN_EXCHANGE_GRANT_TYPE,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { ManagedSignInService } from './managedSignIn/ManagedSignInService';
import { OAuthService } from './OAuthService';

const database = knex({ client: MockClient, dialect: 'pg' });
const flags = { get: vi.fn() };
const model = new OAuth2Model(database, lightdashConfigMock, flags);
const client = { id: 'client', grants: ['refresh_token'], scopes: ['read'] };
const user = { userId: 42, organizationUuid: 'org' };
const lightdashConfig = {
    ...lightdashConfigMock,
    auth: {
        ...lightdashConfigMock.auth,
        oauthServer: {
            accessTokenLifetime: 3600,
            refreshTokenLifetime: 86400,
            mobileRefreshTokenLifetime: 86400,
            refreshTokenRotationGrace: 0,
        },
    },
};
const service = new OAuthService({
    oauthModel: model,
    userModel: {} as UserModel,
    lightdashConfig,
});
const refresh = (scope?: string, resource?: unknown) =>
    service.token(
        new OAuth2Server.Request({
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'transfer-encoding': 'chunked',
            },
            query: {},
            body: {
                grant_type: 'refresh_token',
                client_id: 'client',
                refresh_token: 'refresh',
                ...(scope === undefined ? {} : { scope }),
                ...(resource === undefined ? {} : { resource }),
            },
        }),
        new OAuth2Server.Response({}),
    );

beforeEach(() => {
    getTracker()
        .on.select(/from "users"/)
        .response({ user_uuid: 'user' });
    vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    vi.spyOn(model, 'getClient').mockResolvedValue(client);
    vi.spyOn(model, 'getRefreshToken').mockResolvedValue({
        accessToken: '',
        refreshToken: 'refresh',
        refreshTokenExpiresAt: new Date(Date.now() + 60000),
        scope: ['write'],
        client,
        user,
    });
    vi.spyOn(model, 'revokeToken').mockResolvedValue(true);
    vi.spyOn(model, 'saveToken').mockImplementation(
        async (token, savedClient, savedUser) => ({
            ...token,
            client: savedClient,
            user: savedUser,
        }),
    );
});
afterEach(() => {
    vi.restoreAllMocks();
    getTracker().reset();
});

it.each([null, 'log', 'enforce'] as const)(
    'checks the current registered scopes before refresh rotation in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? mode !== null
                    : mode === 'enforce',
        }));
        if (mode === 'enforce') {
            await expect(refresh()).rejects.toMatchObject({
                name: 'invalid_scope',
            });
            expect(model.revokeToken).not.toHaveBeenCalled();
            expect(model.saveToken).not.toHaveBeenCalled();
        } else {
            await expect(refresh()).resolves.toMatchObject({
                scope: ['write'],
            });
            if (mode === null) expect(model.revokeToken).toHaveBeenCalledOnce();
            else {
                expect(model.revokeToken).not.toHaveBeenCalled();
                expect(model.saveToken).toHaveBeenCalledWith(
                    expect.objectContaining({
                        parentRefreshToken: 'refresh',
                        familyUuid: expect.any(String),
                    }),
                    expect.anything(),
                    expect.anything(),
                );
            }
        }
        expect(Logger.warn).toHaveBeenCalledTimes(mode === null ? 0 : 1);
    },
);
it('allows a refresh narrowed to the current client scope', async () => {
    flags.get.mockResolvedValue({ enabled: true });
    vi.mocked(model.getRefreshToken).mockResolvedValue({
        accessToken: '',
        refreshToken: 'refresh',
        scope: ['read', 'write'],
        client,
        user,
    });
    await expect(refresh('read')).resolves.toMatchObject({ scope: ['read'] });
});
it.each(['unknown-client', 'bad-token', 'other-client', 'expired'] as const)(
    'preserves %s authentication failure before checking scopes',
    async (failure) => {
        const validate = vi.spyOn(model, 'validateScope');
        if (failure === 'unknown-client')
            vi.mocked(model.getClient).mockResolvedValue(false);
        else if (failure === 'bad-token')
            vi.mocked(model.getRefreshToken).mockResolvedValue(false);
        else
            vi.mocked(model.getRefreshToken).mockResolvedValue({
                accessToken: '',
                refreshToken: 'refresh',
                scope: ['write'],
                user,
                client:
                    failure === 'other-client'
                        ? { ...client, id: 'other' }
                        : client,
                refreshTokenExpiresAt: new Date(
                    failure === 'expired' ? 0 : Date.now() + 60000,
                ),
            });
        await expect(refresh()).rejects.toMatchObject({
            name:
                failure === 'unknown-client'
                    ? 'invalid_client'
                    : 'invalid_grant',
        });
        expect(validate).not.toHaveBeenCalled();
        expect(model.revokeToken).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(['log', 'enforce'] as const)(
    'redacts legacy refresh scopes in %s records',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity ||
                mode === 'enforce',
        }));
        vi.mocked(model.getRefreshToken).mockResolvedValue({
            accessToken: '',
            refreshToken: 'refresh',
            scope: ['https://example.test/?token=secret'],
            client,
            user,
        });
        if (mode === 'enforce')
            await expect(refresh()).rejects.toMatchObject({
                name: 'invalid_scope',
            });
        else await expect(refresh()).resolves.toBeDefined();
        expect(Logger.warn).toHaveBeenCalledWith(
            'oauth_scope_refusal',
            expect.objectContaining({ scopes: ['unknown'] }),
        );
        expect(JSON.stringify(vi.mocked(Logger.warn).mock.calls)).not.toContain(
            'secret',
        );
    },
);

const tokenRequest = (body: Record<string, string>) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'transfer-encoding': 'chunked',
        },
        query: {},
        body: { client_id: client.id, client_secret: 'client-secret', ...body },
    });

it.each([null, 'log', 'enforce'] as const)(
    'validates authorization-code scopes in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? mode !== null
                    : mode === 'enforce',
        }));
        const codeClient = { ...client, grants: ['authorization_code'] };
        vi.mocked(model.getClient).mockResolvedValue(codeClient);
        vi.spyOn(model, 'getAuthorizationCode').mockResolvedValue({
            authorizationCode: 'code',
            expiresAt: new Date(Date.now() + 60000),
            redirectUri: 'https://example.test/callback',
            scope: ['write'],
            codeChallenge: createHash('sha256')
                .update('a'.repeat(43))
                .digest('base64url'),
            codeChallengeMethod: 'S256',
            client: codeClient,
            user,
        });
        vi.spyOn(model, 'revokeAuthorizationCode').mockResolvedValue(true);
        const result = service.token(
            tokenRequest({
                grant_type: 'authorization_code',
                code: 'code',
                code_verifier: 'a'.repeat(43),
                redirect_uri: 'https://example.test/callback',
            }),
            new OAuth2Server.Response({}),
        );
        if (mode === 'enforce') {
            await expect(result).rejects.toMatchObject({
                name: 'invalid_scope',
            });
            expect(model.saveToken).not.toHaveBeenCalled();
        } else
            await expect(result).resolves.toMatchObject({ scope: ['write'] });
        expect(Logger.warn).toHaveBeenCalledTimes(mode === null ? 0 : 1);
    },
);

it.each(['log', 'enforce'] as const)(
    'keeps invalid PKCE as an authentication failure in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity ||
                mode === 'enforce',
        }));
        const codeClient = { ...client, grants: ['authorization_code'] };
        vi.mocked(model.getClient).mockResolvedValue(codeClient);
        vi.spyOn(model, 'getAuthorizationCode').mockResolvedValue({
            authorizationCode: 'code',
            expiresAt: new Date(Date.now() + 60000),
            redirectUri: 'https://example.test/callback',
            scope: ['write'],
            codeChallenge: 'wrong',
            codeChallengeMethod: 'S256',
            client: codeClient,
            user,
        });
        vi.spyOn(model, 'revokeAuthorizationCode').mockResolvedValue(true);
        const validate = vi.spyOn(model, 'validateScope');
        await expect(
            service.token(
                tokenRequest({
                    grant_type: 'authorization_code',
                    code: 'code',
                    code_verifier: 'a'.repeat(43),
                    redirect_uri: 'https://example.test/callback',
                }),
                new OAuth2Server.Response({}),
            ),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
        expect(validate).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each([null, 'log', 'enforce'] as const)(
    'validates token-exchange scopes in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? mode !== null
                    : mode === 'enforce',
        }));
        const exchangeClient = {
            ...client,
            grants: [TOKEN_EXCHANGE_GRANT_TYPE],
        };
        vi.mocked(model.getClient).mockResolvedValue(exchangeClient);
        const getManagedSignInService = () =>
            ({
                exchangeIdToken: vi.fn(async () => user),
                recordSignInAllowed: vi.fn(),
            }) as unknown as ManagedSignInService;
        const exchangeService = new OAuthService({
            oauthModel: model,
            userModel: {} as UserModel,
            lightdashConfig,
            getManagedSignInService,
        });
        const result = exchangeService.token(
            tokenRequest({
                grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
                subject_token: 'verified-by-managed-sign-in',
                subject_token_type: ID_TOKEN_TYPE,
                scope: 'write',
            }),
            new OAuth2Server.Response({}),
        );
        if (mode === 'enforce') {
            await expect(result).rejects.toMatchObject({
                name: 'invalid_scope',
            });
            expect(model.saveToken).not.toHaveBeenCalled();
        } else
            await expect(result).resolves.toMatchObject({ scope: ['write'] });
        expect(Logger.warn).toHaveBeenCalledTimes(mode === null ? 0 : 1);
    },
);

it('matches upstream revocation and call order for a widened scope with the flag off', async () => {
    flags.get.mockResolvedValue({ enabled: false });
    vi.mocked(model.getRefreshToken).mockResolvedValue({
        accessToken: '',
        refreshToken: 'refresh',
        scope: ['read'],
        client,
        user,
    });
    const upstream = new OAuth2Server({
        model,
        requireClientAuthentication: { refresh_token: false },
    });
    const request = () =>
        tokenRequest({
            grant_type: 'refresh_token',
            refresh_token: 'refresh',
            scope: 'write',
        });
    const calls: string[] = [];
    vi.mocked(model.getRefreshToken).mockImplementation(async () => {
        calls.push('getRefreshToken');
        return {
            accessToken: '',
            refreshToken: 'refresh',
            scope: ['read'],
            client,
            user,
        };
    });
    vi.mocked(model.revokeToken).mockImplementation(async () => {
        calls.push('revokeToken');
        return true;
    });
    await expect(
        upstream.token(request(), new OAuth2Server.Response({})),
    ).rejects.toMatchObject({ name: 'invalid_scope' });
    const upstreamCalls = [...calls];
    const revocations = vi.mocked(model.revokeToken).mock.calls.length;
    calls.length = 0;
    vi.mocked(model.revokeToken).mockClear();
    await expect(
        service.token(request(), new OAuth2Server.Response({})),
    ).rejects.toMatchObject({ name: 'invalid_scope' });
    expect(calls).toEqual(upstreamCalls);
    expect(model.revokeToken).toHaveBeenCalledTimes(revocations);
    expect(revocations).toBe(1);
});

it.each([null, 'log', 'enforce'] as const)(
    'preserves an undefined refresh scope in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? mode !== null
                    : mode === 'enforce',
        }));
        vi.mocked(model.getRefreshToken).mockResolvedValue({
            accessToken: '',
            refreshToken: 'refresh',
            client,
            user,
        });
        await expect(refresh()).resolves.toMatchObject({ scope: undefined });
        if (mode === null) expect(model.revokeToken).toHaveBeenCalledOnce();
        else {
            expect(model.revokeToken).not.toHaveBeenCalled();
            expect(model.saveToken).toHaveBeenCalledWith(
                expect.objectContaining({
                    parentRefreshToken: 'refresh',
                    familyUuid: expect.any(String),
                }),
                expect.anything(),
                expect.anything(),
            );
        }
        expect(Logger.warn).not.toHaveBeenCalled();
    },
);

it.each(['log', 'enforce'] as const)(
    'rejects refresh resource switches in strict %s mode before rotation',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity ||
                mode === 'enforce',
        }));
        const api = lightdashConfig.siteUrl.replace(/\/$/, '');
        vi.mocked(model.getRefreshToken).mockResolvedValue({
            accessToken: '',
            refreshToken: 'refresh',
            scope: ['read'],
            client,
            user,
            resource: `${api}/api/v1/mcp`,
        });
        await expect(refresh(undefined, api)).rejects.toMatchObject({
            name: 'invalid_target',
        });
        expect(model.revokeToken).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(['https://foreign.example', ['one', 'two']])(
    'rejects invalid refresh resource %j',
    async (resource) => {
        flags.get.mockResolvedValue({ enabled: true });
        await expect(refresh('read', resource)).rejects.toMatchObject({
            name: 'invalid_target',
        });
        expect(model.revokeToken).not.toHaveBeenCalled();
    },
);

it.each([
    [true, null, null],
    [true, null, 'mcp'],
    [true, 'mcp', null],
    [true, 'mcp', 'mcp'],
    [false, null, 'foreign'],
])(
    'propagates refresh resource strict=%s parent=%s requested=%s',
    async (strict, parent, requested) => {
        flags.get.mockResolvedValue({ enabled: strict });
        const api = lightdashConfig.siteUrl.replace(/\/$/, '');
        const mcp = `${api}/api/v1/mcp`;
        vi.mocked(model.getRefreshToken).mockResolvedValue({
            accessToken: '',
            refreshToken: 'refresh',
            scope: ['read'],
            client,
            user,
            resource: parent === 'mcp' ? mcp : null,
        });
        let requestResource: string | undefined;
        if (requested === 'mcp') requestResource = `${mcp}/`;
        if (requested === 'foreign') requestResource = requested;
        const token = await refresh(undefined, requestResource);
        const expectedResource =
            parent === 'mcp' || requested === 'mcp' ? mcp : api;
        expect(token.resource).toBe(strict ? expectedResource : null);
    },
);

describe('strict refresh token families', () => {
    type StoredToken = {
        refresh_token?: string;
        access_token?: string;
        family_uuid: string | null;
        revoked_at: Date | null;
        expires_at: Date;
        resource: string | null;
        scope: string[];
        client_id: string;
        user_id: number;
        organization_uuid: string;
    };
    let rotationModel: OAuth2Model;
    let rotationService: OAuthService;
    let refreshRows: Map<string, StoredToken>;
    let accessRows: Map<string, StoredToken>;
    let strict: boolean;
    const family = '11111111-1111-4111-8111-111111111111';
    const otherFamily = '22222222-2222-4222-8222-222222222222';
    const api = lightdashConfig.siteUrl.replace(/\/$/, '');
    const row = (
        refreshToken: string,
        familyUuid: string | null,
    ): StoredToken => ({
        refresh_token: refreshToken,
        family_uuid: familyUuid,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86400000 * 14),
        resource: api,
        scope: ['read'],
        client_id: client.id,
        user_id: user.userId,
        organization_uuid: user.organizationUuid,
    });
    const rotate = (
        refreshToken: string,
        extra: { scope?: string; resource?: string } = {},
    ) =>
        rotationService.token(
            tokenRequest({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                ...extra,
            }),
            new OAuth2Server.Response({}),
        );

    beforeEach(() => {
        strict = true;
        refreshRows = new Map([
            ['A', row('A', family)],
            ['other', row('other', otherFamily)],
        ]);
        accessRows = new Map([
            [
                'other-access',
                { ...row('other', otherFamily), access_token: 'other-access' },
            ],
        ]);
        const rotationFlags = {
            get: vi.fn(
                async ({
                    featureFlagId,
                }: Parameters<FeatureFlagModel['get']>[0]) => ({
                    id: featureFlagId,
                    enabled: strict,
                }),
            ),
        };
        rotationModel = new OAuth2Model(
            database,
            {
                ...lightdashConfig,
                auth: {
                    ...lightdashConfig.auth,
                    oauthServer: {
                        ...lightdashConfig.auth.oauthServer,
                        refreshTokenRotationGrace: 60,
                    },
                },
            },
            rotationFlags,
        );
        vi.spyOn(rotationModel, 'getClient').mockResolvedValue(client);
        rotationService = new OAuthService({
            oauthModel: rotationModel,
            userModel: {} as UserModel,
            lightdashConfig,
        });
        const tracker = getTracker();
        tracker.on.select('pg_advisory_xact_lock').response([]);
        tracker.on.select('oauth2_refresh_tokens').response(({ bindings }) => {
            const stored = refreshRows.get(String(bindings[0]));
            return stored
                ? { ...stored, grants: client.grants, scopes: client.scopes }
                : undefined;
        });
        tracker.on
            .select('oauth2_access_tokens')
            .response(({ bindings }) => accessRows.get(String(bindings[0])));
        tracker.on
            .insert(/oauth2_(access|refresh)_tokens/)
            .response(({ sql, bindings }) => {
                const columns = sql
                    .slice(sql.indexOf('(') + 1, sql.indexOf(')'))
                    .replaceAll('"', '')
                    .split(', ');
                const stored = {
                    revoked_at: null,
                    ...Object.fromEntries(
                        columns.map((column, index) => [
                            column,
                            bindings[index],
                        ]),
                    ),
                } as StoredToken;
                if (stored.refresh_token)
                    refreshRows.set(stored.refresh_token, stored);
                if (stored.access_token)
                    accessRows.set(stored.access_token, stored);
                return [];
            });
        tracker.on
            .update('oauth2_refresh_tokens')
            .response(({ sql, bindings }) => {
                if (sql.includes('where "family_uuid"')) {
                    let count = 0;
                    refreshRows.forEach((stored, key) => {
                        if (stored.family_uuid === bindings.at(-1)) {
                            refreshRows.set(key, {
                                ...stored,
                                revoked_at: stored.revoked_at ?? new Date(),
                            });
                            count += 1;
                        }
                    });
                    return count;
                }
                const stored = refreshRows.get(String(bindings.at(-1)));
                if (
                    !stored ||
                    (sql.includes('"revoked_at" is null') &&
                        stored.revoked_at !== null)
                )
                    return 0;
                stored.revoked_at ??= new Date();
                if (sql.includes('"family_uuid" ='))
                    stored.family_uuid ??= String(bindings[0]);
                return sql.includes('returning')
                    ? [{ family_uuid: stored.family_uuid }]
                    : 1;
            });
        tracker.on.delete('oauth2_access_tokens').response(({ bindings }) => {
            let count = 0;
            accessRows.forEach((stored, key) => {
                if (stored.family_uuid === bindings[0]) {
                    accessRows.delete(key);
                    count += 1;
                }
            });
            return count;
        });
        tracker.on.delete('oauth2_refresh_tokens').response(0);
        const transaction = database.transaction.bind(database);
        let pending: Promise<unknown> = Promise.resolve();
        vi.spyOn(database, 'transaction').mockImplementation(((
            ...args: Parameters<typeof transaction>
        ) => {
            const next = pending.then(() => transaction(...args));
            pending = next.catch(() => undefined);
            return next;
        }) as typeof database.transaction);
    });

    it('rejects a reused refresh token and revokes its family', async () => {
        const child = await rotate('A');
        expect(child).not.toHaveProperty('parentRefreshToken');
        refreshRows.get('A')!.revoked_at = new Date(Date.now() - 2 * 86400000);
        await expect(rotate('A')).rejects.toMatchObject({
            name: 'invalid_grant',
        });
        await expect(rotate(child.refreshToken!)).rejects.toMatchObject({
            name: 'invalid_grant',
        });
        expect(await rotationModel.getAccessToken(child.accessToken)).toBe(
            false,
        );
    });
    it('revokes the family when an expired stored ancestor is replayed', async () => {
        const child = await rotate('A');
        const ancestor = refreshRows.get('A')!;
        expect(ancestor.revoked_at).toBeInstanceOf(Date);
        ancestor.expires_at = new Date(Date.now() - 60000);
        expect(
            refreshRows.get(child.refreshToken!)!.expires_at.getTime(),
        ).toBeGreaterThan(Date.now());

        await expect(rotate('A')).rejects.toMatchObject({
            name: 'invalid_grant',
        });
        expect(refreshRows.get(child.refreshToken!)!.revoked_at).toBeInstanceOf(
            Date,
        );
        expect(accessRows.has(child.accessToken)).toBe(false);
        await expect(rotate(child.refreshToken!)).rejects.toMatchObject({
            name: 'invalid_grant',
        });
    });
    it('rejects reuse inside the legacy grace window', async () => {
        const child = await rotate('A');
        await expect(rotate('A')).rejects.toMatchObject({
            name: 'invalid_grant',
        });
        expect(refreshRows.get(child.refreshToken!)!.revoked_at).toBeInstanceOf(
            Date,
        );
        expect(accessRows.has(child.accessToken)).toBe(false);
    });
    it.each([false, true])(
        'revokes the family when two refreshes race with legacy=%s',
        async (legacy) => {
            if (legacy) refreshRows.get('A')!.family_uuid = null;
            const read = rotationModel.getRefreshToken.bind(rotationModel);
            let readers = 0;
            let release!: () => void;
            const bothRead = new Promise<void>((resolve) => {
                release = resolve;
            });
            vi.spyOn(rotationModel, 'getRefreshToken').mockImplementation(
                async (token) => {
                    const stored = await read(token);
                    readers += 1;
                    if (readers === 2) release();
                    await bothRead;
                    return stored;
                },
            );
            const outcomes = await Promise.allSettled([
                rotate('A'),
                rotate('A'),
            ]);
            expect(
                outcomes.filter((outcome) => outcome.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                outcomes.find((outcome) => outcome.status === 'rejected'),
            ).toMatchObject({ reason: { name: 'invalid_grant' } });
            const assigned = refreshRows.get('A')!.family_uuid;
            expect(assigned).not.toBeNull();
            expect(
                [...refreshRows.values()]
                    .filter((stored) => stored.family_uuid === assigned)
                    .every((stored) => stored.revoked_at !== null),
            ).toBe(true);
            expect(
                [...accessRows.values()].some(
                    (stored) => stored.family_uuid === assigned,
                ),
            ).toBe(false);
            expect(Logger.warn).toHaveBeenCalledWith(
                'oauth_refresh_token_reuse',
                expect.objectContaining({
                    reason: 'race',
                    familyUuid: assigned,
                }),
            );
        },
    );
    it('leaves other families untouched', async () => {
        await rotate('A');
        await expect(rotate('A')).rejects.toMatchObject({
            name: 'invalid_grant',
        });
        expect(refreshRows.get('other')!.revoked_at).toBeNull();
        expect(accessRows.has('other-access')).toBe(true);
        await expect(rotate('other')).resolves.toBeDefined();
    });
    it('starts a new family for a legacy refresh token', async () => {
        refreshRows.get('A')!.family_uuid = null;
        const child = await rotate('A');
        const assigned = refreshRows.get(child.refreshToken!)!.family_uuid;
        expect(assigned).toMatch(/^[0-9a-f-]{36}$/);
        expect(accessRows.get(child.accessToken)!.family_uuid).toBe(assigned);
        expect(refreshRows.get('A')!.family_uuid).toBe(assigned);
        const grandchild = await rotate(child.refreshToken!);
        expect(refreshRows.get(grandchild.refreshToken!)!.family_uuid).toBe(
            assigned,
        );
        await expect(rotate('A')).rejects.toMatchObject({
            name: 'invalid_grant',
        });
        expect(accessRows.has(grandchild.accessToken)).toBe(false);
    });
    it.each([{ scope: 'write' }, { resource: `${api}/api/v1/mcp` }])(
        'does not consume a refused refresh %j',
        async (extra) => {
            await expect(rotate('A', extra)).rejects.toMatchObject({
                name: extra.scope ? 'invalid_scope' : 'invalid_target',
            });
            expect(refreshRows.get('A')!.revoked_at).toBeNull();
            expect(refreshRows.get('A')!.family_uuid).toBe(family);
            expect(getTracker().history.update).toHaveLength(0);
            await expect(rotate('A')).resolves.toBeDefined();
        },
    );
    it('keeps grace replay and null families with the flag off', async () => {
        strict = false;
        const first = await rotate('A');
        const retry = await rotate('A');
        expect(refreshRows.get(first.refreshToken!)!.family_uuid).toBeNull();
        expect(refreshRows.get(retry.refreshToken!)!.family_uuid).toBeNull();
        expect(accessRows.has(first.accessToken)).toBe(true);
        expect(Logger.warn).not.toHaveBeenCalled();
    });
    it.each([true, false])(
        'sets code exchange families only under strict=%s',
        async (enabled) => {
            strict = enabled;
            const codeClient = {
                ...client,
                grants: ['authorization_code', 'refresh_token'],
            };
            vi.mocked(rotationModel.getClient).mockResolvedValue(codeClient);
            vi.spyOn(rotationModel, 'getAuthorizationCode').mockResolvedValue({
                authorizationCode: 'code',
                expiresAt: new Date(Date.now() + 60000),
                redirectUri: 'https://example.test/callback',
                scope: ['read'],
                codeChallenge: createHash('sha256')
                    .update('a'.repeat(43))
                    .digest('base64url'),
                codeChallengeMethod: 'S256',
                client: codeClient,
                user,
            });
            vi.spyOn(
                rotationModel,
                'revokeAuthorizationCode',
            ).mockResolvedValue(true);
            const issued = await rotationService.token(
                tokenRequest({
                    grant_type: 'authorization_code',
                    code: 'code',
                    code_verifier: 'a'.repeat(43),
                    redirect_uri: 'https://example.test/callback',
                }),
                new OAuth2Server.Response({}),
            );
            const assigned = refreshRows.get(issued.refreshToken!)!.family_uuid;
            if (enabled) expect(assigned).toMatch(/^[0-9a-f-]{36}$/);
            else expect(assigned).toBeNull();
            expect(accessRows.get(issued.accessToken)!.family_uuid).toBe(
                assigned,
            );
            if (enabled) {
                const child = await rotate(issued.refreshToken!);
                expect(refreshRows.get(child.refreshToken!)!.family_uuid).toBe(
                    assigned,
                );
            }
        },
    );
    it.each([true, false])(
        'sets Microsoft exchange families only under strict=%s',
        async (enabled) => {
            strict = enabled;
            vi.mocked(rotationModel.getClient).mockResolvedValue({
                ...client,
                grants: [TOKEN_EXCHANGE_GRANT_TYPE, 'refresh_token'],
            });
            const exchangeService = new OAuthService({
                oauthModel: rotationModel,
                userModel: {} as UserModel,
                lightdashConfig,
                getManagedSignInService: () =>
                    ({
                        exchangeIdToken: vi.fn(async () => user),
                        recordSignInAllowed: vi.fn(),
                    }) as unknown as ManagedSignInService,
            });
            const issued = await exchangeService.token(
                tokenRequest({
                    grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
                    subject_token: 'verified-by-managed-sign-in',
                    subject_token_type: ID_TOKEN_TYPE,
                    scope: 'read',
                }),
                new OAuth2Server.Response({}),
            );
            const assigned = refreshRows.get(issued.refreshToken!)!.family_uuid;
            if (enabled) expect(assigned).toMatch(/^[0-9a-f-]{36}$/);
            else expect(assigned).toBeNull();
            expect(accessRows.get(issued.accessToken)!.family_uuid).toBe(
                assigned,
            );
        },
    );
});
