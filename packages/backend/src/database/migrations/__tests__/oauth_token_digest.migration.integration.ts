import {
    AgentCapability,
    FeatureFlags,
    ID_TOKEN_TYPE,
    OrganizationMemberRole,
    ProjectType,
    TOKEN_EXCHANGE_GRANT_TYPE,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { type Knex } from 'knex';
import { nanoid } from 'nanoid';
import { createHash, randomUUID } from 'node:crypto';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import { AgentConnectionGrantModel } from '../../../models/AgentConnectionGrantModel';
import { OAuth2Model } from '../../../models/OAuth2Model';
import { UserModel } from '../../../models/UserModel';
import { type ManagedSignInService } from '../../../services/OAuthService/managedSignIn/ManagedSignInService';
import { OAuthService } from '../../../services/OAuthService/OAuthService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
afterEach(() => vi.restoreAllMocks());

const digest = (value: string) =>
    `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const forms = ['plain', 'digest'] as const;
type Form = (typeof forms)[number];
type Mode = 'legacy' | 'strict' | 'bound';
const storedValue = (form: Form, value: string) =>
    form === 'plain' ? value : digest(value);

const fixture = async (form: Form, mode: Mode = 'legacy', grace = 60) => {
    const { database } = migrated;
    const config = {
        ...lightdashConfigMock,
        auth: {
            ...lightdashConfigMock.auth,
            oauthServer: {
                accessTokenLifetime: 3600,
                refreshTokenLifetime: 86400,
                mobileRefreshTokenLifetime: 86400,
                refreshTokenRotationGrace: grace,
            },
        },
    };
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Digest read' })
        .returning('*');
    const [user] = await database('users')
        .insert({
            first_name: 'Digest',
            last_name: 'Person',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        })
        .returning('*');
    await database('organization_memberships').insert({
        organization_id: organization.organization_id,
        user_id: user.user_id,
        role: OrganizationMemberRole.MEMBER,
    });
    const clientId = randomUUID();
    const redirectUri = 'https://client.example/callback';
    await database('oauth2_clients').insert({
        client_id: clientId,
        client_name: 'Digest test',
        redirect_uris: [redirectUri],
        grants: ['authorization_code', 'refresh_token', 'client_credentials'],
        scopes: ['read'],
    });
    const model = new OAuth2Model(database, config, {
        get: async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity &&
                mode !== 'legacy',
        }),
    });
    const service = new OAuthService({
        oauthModel: model,
        userModel: {} as UserModel,
        lightdashConfig: config,
    });
    const grants = new AgentConnectionGrantModel({ database });
    const familyUuid = mode === 'legacy' ? null : randomUUID();
    let grantUuid: string | null = null;
    if (mode === 'bound') {
        const [project] = await database('projects')
            .insert({
                organization_id: organization.organization_id,
                name: 'Digest project',
                project_type: ProjectType.DEFAULT,
                created_by_user_uuid: user.user_uuid,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: '1.7',
                organization_warehouse_credentials_uuid: null,
            })
            .returning('*');
        const capability = AgentCapability.ReadDiscover;
        const grant = await grants.create({
            organizationUuid: organization.organization_uuid,
            subjectUserUuid: user.user_uuid,
            clientId,
            name: 'Digest connection',
            resource: config.siteUrl,
            approvedCapabilities: [capability],
            approvedProjectUuids: [project.project_uuid],
            resourceConstraints: {
                version: 2,
                projectCapabilities: { [project.project_uuid]: [capability] },
            },
            approvalPolicyVersion: null,
            approvedByUserUuid: user.user_uuid,
            approvalRequestUuid: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
        });
        grantUuid = grant.grantUuid;
        await grants.bindRefreshFamily({
            organizationUuid: organization.organization_uuid,
            grantUuid,
            familyUuid: familyUuid!,
        });
    }
    const accessToken = `ldapp_${nanoid(64)}`;
    const refreshToken = `ldref_${nanoid(64)}`;
    const authorizationCode = nanoid(64);
    const verifier = nanoid(64);
    const common = {
        client_id: clientId,
        user_id: user.user_id,
        organization_uuid: organization.organization_uuid,
        scope: ['read'],
        resource: mode === 'legacy' ? null : config.siteUrl,
        agent_connection_grant_uuid: grantUuid,
        expires_at: new Date(Date.now() + 3600000),
    };
    await database('oauth2_access_tokens').insert({
        ...common,
        family_uuid: familyUuid,
        access_token: storedValue(form, accessToken),
    });
    await database('oauth2_refresh_tokens').insert({
        ...common,
        family_uuid: familyUuid,
        refresh_token: storedValue(form, refreshToken),
    });
    await database('oauth2_authorization_codes').insert({
        ...common,
        authorization_code: storedValue(form, authorizationCode),
        redirect_uri: redirectUri,
        code_challenge: createHash('sha256')
            .update(verifier)
            .digest('base64url'),
        code_challenge_method: 'S256',
    });
    const exchange = (body: Record<string, string>) =>
        service.token(
            new OAuth2Server.Request({
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'transfer-encoding': 'chunked',
                },
                query: {},
                body: { client_id: clientId, ...body },
            }),
            new OAuth2Server.Response({}),
        );
    const refresh = (value = refreshToken) =>
        exchange({ grant_type: 'refresh_token', refresh_token: value });
    const authenticate = (value = accessToken) =>
        service.authenticate(
            new OAuth2Server.Request({
                method: 'GET',
                headers: { authorization: `Bearer ${value}` },
                query: {},
                body: {},
            }),
            new OAuth2Server.Response({}),
        );
    const identity = {
        userId: user.user_id,
        organizationUuid: organization.organization_uuid,
    };
    const client = {
        id: clientId,
        grants: ['authorization_code', 'refresh_token'],
        redirectUris: [redirectUri],
    };
    return {
        database,
        userUuid: user.user_uuid,
        config,
        model,
        service,
        grants,
        grantUuid,
        familyUuid,
        clientId,
        client,
        identity,
        accessToken,
        refreshToken,
        authorizationCode,
        verifier,
        redirectUri,
        refresh,
        exchange,
        authenticate,
    };
};

const expectPlainIssue = async (
    f: Awaited<ReturnType<typeof fixture>>,
    token: OAuth2Server.Token,
) => {
    const access = await f
        .database('oauth2_access_tokens')
        .where('client_id', f.clientId)
        .where('access_token', token.accessToken)
        .first();
    expect(access?.access_token === token.accessToken).toBe(true);
    expect(token.accessToken.startsWith('sha256:')).toBe(false);
    if (token.refreshToken) {
        const refresh = await f
            .database('oauth2_refresh_tokens')
            .where('client_id', f.clientId)
            .where('refresh_token', token.refreshToken)
            .first();
        expect(refresh?.refresh_token === token.refreshToken).toBe(true);
        expect(token.refreshToken.startsWith('sha256:')).toBe(false);
    }
};

for (const form of forms) {
    describe(`stored ${form}`, () => {
        it('reads all three values and returns only presented values', async () => {
            const f = await fixture(form);
            const access = await f.model.getAccessToken(f.accessToken);
            const refresh = await f.model.getRefreshToken(f.refreshToken);
            const code = await f.model.getAuthorizationCode(
                f.authorizationCode,
            );
            expect(
                access !== false && access.accessToken === f.accessToken,
            ).toBe(true);
            expect(
                refresh !== false && refresh.refreshToken === f.refreshToken,
            ).toBe(true);
            expect(
                code !== false &&
                    code.authorizationCode === f.authorizationCode,
            ).toBe(true);
        });

        it('refuses stored digests and bare hashes for all three credentials', async () => {
            const f = await fixture(form);
            await [false, true].reduce(async (previous, hashOnly) => {
                await previous;
                const present = (value: string) =>
                    hashOnly ? digest(value).slice(7) : digest(value);
                expect(
                    (await f.model.getAccessToken(present(f.accessToken))) ===
                        false,
                ).toBe(true);
                expect(
                    (await f.model.getRefreshToken(present(f.refreshToken))) ===
                        false,
                ).toBe(true);
                expect(
                    (await f.model.getAuthorizationCode(
                        present(f.authorizationCode),
                    )) === false,
                ).toBe(true);
            }, Promise.resolve());
        });

        it('does not accept a real value wrapped in an array or object', async () => {
            const f = await fixture(form);
            const wrap = (value: string) =>
                [[value], [value, nanoid(8)], { k: value }] as unknown[];
            await wrap(f.accessToken).reduce(async (previous, wrapped) => {
                await previous;
                const presented = wrapped as string;
                expect(
                    (await f.model.getAccessToken(presented)) === false,
                ).toBe(true);
                expect(await f.model.isAccessTokenBoundToGrant(presented)).toBe(
                    false,
                );
                expect(await f.model.deleteAccessToken(presented)).toBe(false);
            }, Promise.resolve());
            await wrap(f.refreshToken).reduce(async (previous, wrapped) => {
                await previous;
                const presented = wrapped as string;
                expect(
                    (await f.model.getRefreshToken(presented)) === false,
                ).toBe(true);
                expect(await f.model.deleteRefreshToken(presented)).toBe(false);
            }, Promise.resolve());
            await wrap(f.authorizationCode).reduce(
                async (previous, wrapped) => {
                    await previous;
                    expect(
                        (await f.model.getAuthorizationCode(
                            wrapped as string,
                        )) === false,
                    ).toBe(true);
                },
                Promise.resolve(),
            );
            const access = await f.model.getAccessToken(f.accessToken);
            const refresh = await f.model.getRefreshToken(f.refreshToken);
            const code = await f.model.getAuthorizationCode(
                f.authorizationCode,
            );
            expect(
                access !== false && refresh !== false && code !== false,
            ).toBe(true);
        });

        it('refuses an array holding a NUL byte without reaching the database', async () => {
            const f = await fixture(form);
            let queries = 0;
            const count = () => {
                queries += 1;
            };
            f.database.on('query', count);
            try {
                const presented = ['x', '\u0000'] as unknown as string;
                expect(
                    (await f.model.getAccessToken(presented)) === false,
                ).toBe(true);
                expect(
                    (await f.model.getRefreshToken(presented)) === false,
                ).toBe(true);
                expect(
                    (await f.model.getAuthorizationCode(presented)) === false,
                ).toBe(true);
                expect(await f.model.deleteAccessToken(presented)).toBe(false);
                expect(await f.model.deleteRefreshToken(presented)).toBe(false);
                expect(queries).toBe(0);
            } finally {
                f.database.off('query', count);
            }
        });

        it('revokes and deletes the selected rows', async () => {
            const f = await fixture(form);
            const code = await f.model.getAuthorizationCode(
                f.authorizationCode,
            );
            expect(code !== false).toBe(true);
            if (!code) return;
            expect(await f.model.revokeAuthorizationCode(code)).toBe(true);
            expect(
                (await f.model.getAuthorizationCode(f.authorizationCode)) ===
                    false,
            ).toBe(true);
            expect(await f.model.deleteAccessToken(f.accessToken)).toBe(true);
            expect(
                (await f.model.getAccessToken(f.accessToken)) === false,
            ).toBe(true);
            const token = await f.model.getRefreshToken(f.refreshToken);
            expect(token !== false).toBe(true);
            if (!token) return;
            expect(await f.model.revokeToken(token)).toBe(true);
            const row = await f
                .database('oauth2_refresh_tokens')
                .where('client_id', f.clientId)
                .first();
            expect(row?.revoked_at instanceof Date).toBe(true);
            expect(await f.model.deleteRefreshToken(f.refreshToken)).toBe(true);
            expect(
                (await f.model.getRefreshToken(f.refreshToken)) === false,
            ).toBe(true);
        });

        it.each(['legacy', 'strict', 'bound'] as const)(
            'exchanges a PKCE code and writes plain credentials in %s mode',
            async (mode) => {
                const f = await fixture(form, mode);
                const token = await f.exchange({
                    grant_type: 'authorization_code',
                    code: f.authorizationCode,
                    redirect_uri: f.redirectUri,
                    code_verifier: f.verifier,
                });
                await expectPlainIssue(f, token);
                expect(
                    (await f.model.getAuthorizationCode(
                        f.authorizationCode,
                    )) === false,
                ).toBe(true);
                expect(token.agentConnectionGrantUuid === f.grantUuid).toBe(
                    true,
                );
            },
        );

        it.each(['legacy', 'strict', 'bound'] as const)(
            'rotates, consumes and handles reuse in %s mode',
            async (mode) => {
                const f = await fixture(form, mode);
                const logs = vi
                    .spyOn(Logger, 'warn')
                    .mockImplementation(() => Logger);
                const child = await f.refresh();
                await expectPlainIssue(f, child);
                const old = await f
                    .database('oauth2_refresh_tokens')
                    .where('refresh_token', storedValue(form, f.refreshToken))
                    .first();
                expect(old?.revoked_at instanceof Date).toBe(true);
                if (mode === 'legacy') {
                    const graceChild = await f.refresh();
                    await expectPlainIssue(f, graceChild);
                    await f
                        .database('oauth2_refresh_tokens')
                        .where(
                            'refresh_token',
                            storedValue(form, f.refreshToken),
                        )
                        .update({ revoked_at: new Date(Date.now() - 61000) });
                    await expect(f.refresh()).rejects.toMatchObject({
                        name: 'invalid_grant',
                    });
                    expect(logs).not.toHaveBeenCalled();
                } else {
                    await expect(f.refresh()).rejects.toMatchObject({
                        name: 'invalid_grant',
                    });
                    await expect(
                        f.authenticate(child.accessToken),
                    ).rejects.toMatchObject({ name: 'invalid_token' });
                    const rows = await f
                        .database('oauth2_refresh_tokens')
                        .where('client_id', f.clientId);
                    expect(rows.every((row) => row.revoked_at !== null)).toBe(
                        true,
                    );
                    expect(logs).toHaveBeenCalledWith(
                        'oauth_refresh_token_reuse',
                        expect.objectContaining({ reason: 'reused' }),
                    );
                }
            },
        );

        it.each([
            { mode: 'strict' as const, age: 0 },
            { mode: 'strict' as const, age: 61000 },
            { mode: 'bound' as const, age: 0 },
            { mode: 'bound' as const, age: 61000 },
        ])(
            'detects save races in $mode mode at age $age',
            async ({ mode, age }) => {
                const f = await fixture(form, mode);
                vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
                const parent = await f.model.getRefreshToken(f.refreshToken);
                expect(parent !== false).toBe(true);
                if (!parent) return;
                const child = await f.refresh();
                await f
                    .database('oauth2_refresh_tokens')
                    .where('refresh_token', storedValue(form, f.refreshToken))
                    .update({ revoked_at: new Date(Date.now() - age) });
                await expect(
                    f.model.saveToken(
                        {
                            ...parent,
                            accessToken: `ldapp_${nanoid(64)}`,
                            client: f.client,
                            user: f.identity,
                            refreshToken: `ldref_${nanoid(64)}`,
                            accessTokenExpiresAt: new Date(
                                Date.now() + 3600000,
                            ),
                            parentRefreshToken: f.refreshToken,
                        },
                        f.client,
                        f.identity,
                    ),
                ).rejects.toMatchObject({ name: 'invalid_grant' });
                expect(Logger.warn).toHaveBeenCalledWith(
                    'oauth_refresh_token_reuse',
                    expect.objectContaining({ reason: 'race' }),
                );
                await expect(f.refresh()).rejects.toMatchObject({
                    name: 'invalid_grant',
                });
                await expect(
                    f.authenticate(child.accessToken),
                ).rejects.toMatchObject({ name: 'invalid_token' });
            },
        );

        it('uses strict revokeToken consumption for both initial use and a race', async () => {
            const f = await fixture(form, 'strict');
            vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
            const token = await f.model.getRefreshToken(f.refreshToken);
            expect(token !== false).toBe(true);
            if (!token) return;
            expect(await f.model.revokeToken(token)).toBe(true);
            expect(await f.model.revokeToken(token)).toBe(false);
            expect(Logger.warn).toHaveBeenCalledWith(
                'oauth_refresh_token_reuse',
                expect.objectContaining({ reason: 'race' }),
            );
        });

        it('retains refused access rows and revokes a grant from its refresh value', async () => {
            const f = await fixture(form, 'bound');
            expect(await f.model.isAccessTokenBoundToGrant(f.accessToken)).toBe(
                true,
            );
            await f.authenticate();
            expect(await f.model.deleteAccessToken(f.accessToken)).toBe(true);
            const row = await f
                .database('oauth2_access_tokens')
                .where('client_id', f.clientId)
                .first();
            expect(row?.access_token === storedValue(form, f.accessToken)).toBe(
                true,
            );
            expect(row?.expires_at.getTime()).toBe(0);
            expect(await f.model.isAccessTokenBoundToGrant(f.accessToken)).toBe(
                true,
            );
            await expect(f.authenticate()).rejects.toMatchObject({
                name: 'invalid_token',
            });
            expect(await f.model.deleteRefreshToken(f.refreshToken)).toBe(true);
            await expect(
                f.model.getAccessToken(f.accessToken),
            ).rejects.toMatchObject({ name: 'invalid_token' });
            const grant = await f.grants.find(f.grantUuid!);
            expect(grant?.revokedAt instanceof Date).toBe(true);
        });

        it('refuses a revoked grant with an otherwise live access row', async () => {
            const f = await fixture(form, 'bound');
            await f.grants.revoke({
                grantUuid: f.grantUuid!,
                organizationUuid: f.identity.organizationUuid,
                revokedByUserUuid: null,
                reason: 'test',
            });
            expect(await f.model.isAccessTokenBoundToGrant(f.accessToken)).toBe(
                true,
            );
            await expect(f.authenticate()).rejects.toMatchObject({
                name: 'invalid_token',
            });
        });

        it('revokes an unbound family through its presented refresh value', async () => {
            const f = await fixture(form, 'strict');
            expect(await f.service.revokeToken(f.refreshToken)).toBe(true);
            expect(
                (await f.model.getAccessToken(f.accessToken)) === false,
            ).toBe(true);
            expect(
                (await f.model.getRefreshToken(f.refreshToken)) === false,
            ).toBe(true);
        });
    });
}

it('rejects prefixed input at every selecting entry point without sending a query', async () => {
    const f = await fixture('plain', 'strict');
    await ['sha256:', `SHA256:${nanoid()}`, digest(nanoid())].reduce(
        async (previous, input) => {
            await previous;
            const queries: string[] = [];
            const listener = ({ sql }: { sql: string }) => queries.push(sql);
            f.database.on('query', listener);
            try {
                expect((await f.model.getAccessToken(input)) === false).toBe(
                    true,
                );
                expect((await f.model.getRefreshToken(input)) === false).toBe(
                    true,
                );
                expect(
                    (await f.model.getAuthorizationCode(input)) === false,
                ).toBe(true);
                expect(await f.model.isAccessTokenBoundToGrant(input)).toBe(
                    false,
                );
                expect(await f.model.deleteAccessToken(input)).toBe(false);
                expect(await f.model.deleteRefreshToken(input)).toBe(false);
                expect(
                    await f.model.revokeAuthorizationCode({
                        authorizationCode: input,
                    } as OAuth2Server.AuthorizationCode),
                ).toBe(false);
                expect(
                    await f.model.revokeToken({
                        accessToken: '',
                        refreshToken: input,
                        user: f.identity,
                        client: f.client,
                    }),
                ).toBe(false);
                await expect(
                    f.model.saveToken(
                        {
                            accessToken: nanoid(),
                            client: f.client,
                            user: f.identity,
                            refreshToken: nanoid(),
                            parentRefreshToken: input,
                        },
                        f.client,
                        f.identity,
                    ),
                ).rejects.toMatchObject({
                    name: 'invalid_grant',
                    message: 'Refresh token is already used',
                });
                await expect(
                    f.model.saveToken(
                        {
                            accessToken: nanoid(),
                            client: f.client,
                            user: f.identity,
                            parentRefreshToken: input,
                            agentConnectionGrantUuid: randomUUID(),
                        },
                        f.client,
                        f.identity,
                    ),
                ).rejects.toMatchObject({
                    name: 'invalid_grant',
                    message: 'Agent connection refresh binding is invalid',
                });
                expect(queries.length).toBe(0);
            } finally {
                f.database.removeListener('query', listener);
            }
        },
        Promise.resolve(),
    );
});

it('keeps direct issuance and authorization code writes plain', async () => {
    const f = await fixture('plain');
    const token = await f.model.saveToken(
        {
            accessToken: `ldapp_${nanoid(64)}`,
            client: f.client,
            user: f.identity,
            refreshToken: `ldref_${nanoid(64)}`,
            accessTokenExpiresAt: new Date(Date.now() + 3600000),
            refreshTokenExpiresAt: new Date(Date.now() + 86400000),
            scope: ['read'],
        },
        f.client,
        f.identity,
    );
    await expectPlainIssue(f, token);
    const accessOnly = await f.model.saveToken(
        {
            accessToken: `ldapp_${nanoid(64)}`,
            client: f.client,
            user: f.identity,
            accessTokenExpiresAt: new Date(Date.now() + 3600000),
        },
        f.client,
        f.identity,
    );
    await expectPlainIssue(f, accessOnly);
    const code = await f.model.saveAuthorizationCode(
        {
            authorizationCode: nanoid(64),
            expiresAt: new Date(Date.now() + 60000),
            redirectUri: f.redirectUri,
            scope: ['read'],
            resource: null,
        },
        f.client,
        f.identity,
    );
    const rows = await f
        .database('oauth2_authorization_codes')
        .where('client_id', f.clientId);
    expect(
        rows.some((row) => row.authorization_code === code.authorizationCode),
    ).toBe(true);
    await (
        [
            ['oauth2_access_tokens', 'access_token'],
            ['oauth2_refresh_tokens', 'refresh_token'],
            ['oauth2_authorization_codes', 'authorization_code'],
        ] as const
    ).reduce(async (previous, [table, column]) => {
        await previous;
        const records = await f
            .database(table)
            .where('client_id', f.clientId)
            .select(column);
        expect(
            records.every(
                (row) =>
                    !String(row[column as keyof typeof row]).startsWith(
                        'sha256:',
                    ),
            ),
        ).toBe(true);
    }, Promise.resolve());
});

it('uses one indexed primary-key candidate lookup for each credential', async () => {
    const f = await fixture('digest');
    const cases = [
        {
            table: 'oauth2_access_tokens',
            column: 'access_token',
            value: f.accessToken,
            read: () => f.model.getAccessToken(f.accessToken),
        },
        {
            table: 'oauth2_refresh_tokens',
            column: 'refresh_token',
            value: f.refreshToken,
            read: () => f.model.getRefreshToken(f.refreshToken),
        },
        {
            table: 'oauth2_authorization_codes',
            column: 'authorization_code',
            value: f.authorizationCode,
            read: () => f.model.getAuthorizationCode(f.authorizationCode),
        },
    ];
    await cases.reduce(async (previous, entry) => {
        await previous;
        const queries: { sql: string; bindings: Knex.RawBinding[] }[] = [];
        const listener = (query: {
            sql: string;
            bindings: Knex.RawBinding[];
        }) => queries.push(query);
        f.database.on('query', listener);
        try {
            await entry.read();
        } finally {
            f.database.removeListener('query', listener);
        }
        const reads = queries.filter((query) =>
            query.sql.includes(entry.table),
        );
        expect(reads.length).toBe(1);
        expect(reads[0].sql.includes(' in (')).toBe(true);
        expect(
            reads[0].bindings.includes(entry.value) &&
                reads[0].bindings.includes(digest(entry.value)),
        ).toBe(true);
        const template = await f
            .database(entry.table)
            .where('client_id', f.clientId)
            .first();
        await f.database.batchInsert(
            entry.table,
            Array.from({ length: 3000 }, () => ({
                ...template,
                [entry.column]: nanoid(64),
            })),
            500,
        );
        await f.database.raw('ANALYZE ??', [entry.table]);
        const lookup = f
            .database(entry.table)
            .whereIn(entry.column, [entry.value, digest(entry.value)])
            .first()
            .toSQL();
        const result = await f.database.raw<{
            rows: { 'QUERY PLAN': string }[];
        }>(`EXPLAIN ${lookup.sql}`, lookup.bindings);
        const plan = result.rows.map((row) => row['QUERY PLAN']).join('\n');
        expect(plan.includes(`${entry.table}_pkey`)).toBe(true);
        expect(plan.includes('Seq Scan')).toBe(false);
        const safePlan = result.rows
            .map((row) => row['QUERY PLAN'])
            .filter((line) => !line.includes('Cond:'))
            .join('\n');
        process.stdout.write(`${entry.table}\n${safePlan}\n`);
        const modelResult = await f.database.raw<{
            rows: { 'QUERY PLAN': string }[];
        }>(`EXPLAIN ${reads[0].sql.replace(/\$\d+/g, '?')}`, reads[0].bindings);
        const modelPlan = modelResult.rows
            .map((row) => row['QUERY PLAN'])
            .join('\n');
        expect(modelPlan.includes(`${entry.table}_pkey`)).toBe(true);
        expect(modelPlan.includes(`Seq Scan on ${entry.table}`)).toBe(false);
        process.stdout.write(
            `model ${entry.table}\n${modelResult.rows
                .map((row) => row['QUERY PLAN'])
                .filter((line) => !line.includes('Cond:'))
                .join('\n')}\n`,
        );
    }, Promise.resolve());
});

it.each(['legacy', 'strict'] as const)(
    'keeps managed token exchange writes plain in %s mode',
    async (mode) => {
        const f = await fixture('plain', mode);
        await f
            .database('oauth2_clients')
            .where('client_id', f.clientId)
            .update({
                grants: [TOKEN_EXCHANGE_GRANT_TYPE],
                redirect_uris: ['com.lightdash.mobile://oauth/callback'],
            });
        const managedSignIn = {
            exchangeIdToken: async () => ({
                ...defaultSessionUser,
                ...f.identity,
                userUuid: f.userUuid,
            }),
            recordSignInAllowed: vi.fn(),
        } as unknown as ManagedSignInService;
        const service = new OAuthService({
            oauthModel: f.model,
            userModel: {} as UserModel,
            lightdashConfig: f.config,
            getManagedSignInService: () => managedSignIn,
        });
        const token = await service.token(
            new OAuth2Server.Request({
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'transfer-encoding': 'chunked',
                },
                query: {},
                body: {
                    client_id: f.clientId,
                    grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
                    subject_token: nanoid(64),
                    subject_token_type: ID_TOKEN_TYPE,
                    scope: 'read',
                },
            }),
            new OAuth2Server.Response({}),
        );
        await expectPlainIssue(f, token);
        expect(managedSignIn.recordSignInAllowed).toHaveBeenCalledTimes(1);
    },
);

it('generates and saves a plain authorization code through the authorization service', async () => {
    const f = await fixture('plain', 'strict');
    const code = await f.service.authorize(
        new OAuth2Server.Request({
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            query: {},
            body: {
                client_id: f.clientId,
                response_type: 'code',
                redirect_uri: f.redirectUri,
                scope: 'read',
                state: nanoid(),
                code_challenge: createHash('sha256')
                    .update(f.verifier)
                    .digest('base64url'),
                code_challenge_method: 'S256',
            },
        }),
        new OAuth2Server.Response({}),
        f.identity,
    );
    expect(/^[a-f0-9]{64}$/.test(code.authorizationCode)).toBe(true);
    const row = await f
        .database('oauth2_authorization_codes')
        .where('authorization_code', code.authorizationCode)
        .first();
    expect(row?.authorization_code === code.authorizationCode).toBe(true);
});

it.each(['legacy', 'strict', 'bound'] as const)(
    'has identical read, rotation and revocation outcomes across storage forms in %s mode',
    async (mode) => {
        const outcomes: unknown[] = [];
        await forms.reduce(async (previous, form) => {
            await previous;
            const f = await fixture(form, mode);
            vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
            const access = await f.model.getAccessToken(f.accessToken);
            const refresh = await f.model.getRefreshToken(f.refreshToken);
            const code = await f.model.getAuthorizationCode(
                f.authorizationCode,
            );
            const child = await f.refresh();
            const old = await f
                .database('oauth2_refresh_tokens')
                .where('refresh_token', storedValue(form, f.refreshToken))
                .first();
            const deleted = await f.model.deleteAccessToken(child.accessToken);
            const refused = await f.authenticate(child.accessToken).then(
                () => false,
                () => true,
            );
            outcomes.push({
                access:
                    access !== false && access.accessToken === f.accessToken,
                refresh:
                    refresh !== false &&
                    refresh.refreshToken === f.refreshToken,
                code:
                    code !== false &&
                    code.authorizationCode === f.authorizationCode,
                consumed: old?.revoked_at instanceof Date,
                deleted,
                refused,
                bound: await f.model.isAccessTokenBoundToGrant(f.accessToken),
            });
        }, Promise.resolve());
        expect(outcomes[0]).toEqual(outcomes[1]);
        expect(outcomes[0]).toEqual({
            access: true,
            refresh: true,
            code: true,
            consumed: true,
            deleted: true,
            refused: true,
            bound: mode === 'bound',
        });
    },
);

it.each(forms)(
    'refuses a consumed legacy token with no grace when stored %s',
    async (form) => {
        const f = await fixture(form, 'legacy', 0);
        await f.refresh();
        await f
            .database('oauth2_refresh_tokens')
            .where('refresh_token', storedValue(form, f.refreshToken))
            .update({ revoked_at: new Date(Date.now() - 1000) });
        await expect(f.refresh()).rejects.toMatchObject({
            name: 'invalid_grant',
        });
    },
);
