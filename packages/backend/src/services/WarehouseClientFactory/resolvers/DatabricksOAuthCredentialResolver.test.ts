import {
    assertUnreachable,
    DatabricksAuthenticationType,
    DatabricksTokenError,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateDatabricksCredentials,
} from '@lightdash/common';
import * as warehouses from '@lightdash/warehouses';
import * as deadline from '../../../auth/databricksOAuthRefresh';
import { OAuthRequestTimeoutError } from '../../../auth/oauthRequestDeadline';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import {
    createDatabase,
    deferred,
} from '../../../models/RefreshTokenRotation/fakeKnex.mock';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRotation,
    RefreshTokenSourceChangedError,
} from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../ConnectionContext';
import {
    preparedCredentials,
    type CredentialOwner,
    type CredentialSelection,
    type PreparedCredentials,
} from '../CredentialResolver';
import { DatabricksOAuthCredentialResolver } from './DatabricksOAuthCredentialResolver';

const modes = [
    DatabricksAuthenticationType.OAUTH_U2M,
    DatabricksAuthenticationType.OAUTH_M2M,
];
const credentials: CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
    serverHostName: 'workspace.example.com',
    httpPath: '/sql/warehouse',
    catalog: 'catalog',
    database: 'schema',
    token: 'stale-access',
    refreshToken: 'old-refresh',
};
const selection = (
    connection = credentials,
): CredentialSelection<CreateDatabricksCredentials> => ({
    connection: { ...connection },
    stored: { ...connection },
    owner: { kind: 'project', uuid: 'project' },
    context: connectionContextFromUser(
        { userUuid: 'person' },
        { organizationUuid: 'org', queryContext: null },
    ),
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    credentialKind: WarehouseCredentialKind.SHARED,
    aiPlan: null,
});
const setup = (
    enabled = true,
    authenticationType = DatabricksAuthenticationType.OAUTH_U2M,
) => {
    const current = { ...credentials, authenticationType };
    const { database, raw, transaction } = createDatabase();
    const rotation = new RefreshTokenRotation({ database });
    const run = vi.spyOn(rotation, 'run');
    const project = {
        projectUuid: 'project',
        organizationUuid: 'org',
        connectionMode: 'multi' as const,
        originalWarehouseType: WarehouseTypes.DATABRICKS,
    };
    const deps = {
        lightdashConfig: {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                databricks: {
                    ...lightdashConfigMock.auth.databricks,
                    clientId: 'config-client',
                    clientSecret: 'config-secret',
                },
            },
        },
        refreshTokenRotation: rotation,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue(project),
            getOwnWarehouseCredentialsForProject: vi
                .fn()
                .mockResolvedValue(current),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        organizationWarehouseCredentialsModel: {
            getByUuidWithSensitiveData: vi.fn().mockResolvedValue({
                organizationUuid: 'org',
                credentials: current,
            }),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        userWarehouseCredentialsModel: {
            getByUuidWithSecrets: vi
                .fn()
                .mockResolvedValue({ credentials: current }),
            findDatabricksOauthU2mForHostWithSecrets: vi
                .fn()
                .mockResolvedValue({
                    credentials: { ...current, refreshToken: 'person-refresh' },
                }),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        warehouseConnectionModel: {
            getProject: vi.fn().mockResolvedValue(project),
            getOwnCredentials: vi.fn().mockResolvedValue(current),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        logger: { error: vi.fn() },
        attributeSharedSignInExpiry: vi.fn(
            async (
                _uuid: string,
                _credentials: CreateDatabricksCredentials,
                error: unknown,
            ): Promise<never> => {
                throw error;
            },
        ),
    };
    const result = {
        accessToken: 'fresh-access',
        expiresIn: 3600,
        refreshToken: 'new-refresh',
    };
    const exchange = vi
        .spyOn(warehouses, 'refreshDatabricksOAuthToken')
        .mockResolvedValue(result);
    const lockedExchange = vi
        .spyOn(deadline, 'refreshDatabricksOAuthTokenWithDeadline')
        .mockResolvedValue(result);
    const clientExchange = vi
        .spyOn(warehouses, 'exchangeDatabricksOAuthCredentials')
        .mockResolvedValue(result);
    const resolver = new DatabricksOAuthCredentialResolver(deps);
    return {
        resolver,
        deps,
        exchange,
        lockedExchange,
        clientExchange,
        run,
        raw,
        transaction,
        project,
        input: selection(current),
    };
};
afterEach(() => vi.restoreAllMocks());

describe.each(modes)('Databricks OAuth %s', (mode) => {
    test.each([true, false])(
        'resolves and persists with lock %s',
        async (enabled) => {
            const f = setup(enabled, mode);
            const result = await f.resolver.resolve(f.input);
            expect(result).toEqual({
                clientCredentials: {
                    ...f.input.connection,
                    token: 'fresh-access',
                    refreshToken: 'new-refresh',
                },
                clientOptions: {},
                agentSignIn: null,
                cacheable: true,
            });
            expect(f.input.stored).toEqual({
                ...credentials,
                authenticationType: mode,
            });
            expect(f.deps.featureFlagModel.get).toHaveBeenCalledExactlyOnceWith(
                {
                    user: { organizationUuid: 'org' },
                    featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
                },
            );
            expect(
                enabled ? f.lockedExchange : f.exchange,
            ).toHaveBeenCalledExactlyOnceWith(
                credentials.serverHostName,
                'config-client',
                'old-refresh',
                'config-secret',
            );
            expect(
                enabled ? f.exchange : f.lockedExchange,
            ).not.toHaveBeenCalled();
            expect(f.run).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(
                f.deps.projectModel.getOwnWarehouseCredentialsForProject,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'project',
                'old-refresh',
                'new-refresh',
                ...(enabled ? [{ raw: f.raw }] : []),
            );
            await expect(f.resolver.dispose()).resolves.toBeUndefined();
        },
    );

    test.each([true, false])(
        'owner null stays unlocked with flag %s',
        async (enabled) => {
            const f = setup(enabled, mode);
            await f.resolver.resolve({ ...f.input, owner: null });
            expect(f.run).not.toHaveBeenCalled();
            expect(f.deps.featureFlagModel.get).not.toHaveBeenCalled();
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
            expect(f.exchange).toHaveBeenCalledOnce();
            expect(f.lockedExchange).not.toHaveBeenCalled();
        },
    );

    test.each([
        'project',
        'organization',
        'user',
        'warehouseConnection',
    ] as const)('rereads and writes the exact %s row', async (kind) => {
        const f = setup(true, mode);
        const owner: CredentialOwner =
            kind === 'user'
                ? {
                      kind,
                      uuid: 'row',
                      purpose: UserWarehouseCredentialPurpose.DEFAULT,
                  }
                : { kind, uuid: 'row' };
        const current = {
            ...f.input.connection,
            refreshToken: 'latest-refresh',
        };
        const models = {
            project: f.deps.projectModel,
            organization: f.deps.organizationWarehouseCredentialsModel,
            user: f.deps.userWarehouseCredentialsModel,
            warehouseConnection: f.deps.warehouseConnectionModel,
        };
        f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
            current,
        );
        f.deps.organizationWarehouseCredentialsModel.getByUuidWithSensitiveData.mockResolvedValue(
            { organizationUuid: 'org', credentials: current },
        );
        f.deps.userWarehouseCredentialsModel.getByUuidWithSecrets.mockResolvedValue(
            { credentials: current },
        );
        f.deps.warehouseConnectionModel.getOwnCredentials.mockResolvedValue(
            current,
        );
        await f.resolver.resolve({
            ...f.input,
            owner,
            refreshSource: {
                credentials: f.input.connection,
                fallback: f.input.connection,
                personalCredentialPolicy: { strictPersonalOverlay: false },
            },
        });
        expect(f.lockedExchange).toHaveBeenCalledExactlyOnceWith(
            credentials.serverHostName,
            'config-client',
            'latest-refresh',
            'config-secret',
        );
        expect(models[kind].rotateRefreshToken).toHaveBeenCalledExactlyOnceWith(
            ...(kind === 'warehouseConnection' ? [f.project] : []),
            'row',
            'latest-refresh',
            'new-refresh',
            ...(kind === 'user' ? [undefined] : []),
            { raw: f.raw },
        );
        const read = {
            project: f.deps.projectModel.getOwnWarehouseCredentialsForProject,
            organization:
                f.deps.organizationWarehouseCredentialsModel
                    .getByUuidWithSensitiveData,
            user: f.deps.userWarehouseCredentialsModel.getByUuidWithSecrets,
            warehouseConnection:
                f.deps.warehouseConnectionModel.getOwnCredentials,
        }[kind];
        expect(read).toHaveBeenCalledExactlyOnceWith(
            ...(kind === 'warehouseConnection' ? [f.project] : []),
            'row',
            { raw: f.raw },
            ...(kind === 'user' ? [{ strictPersonalOverlay: false }] : []),
        );
    });

    test.each([undefined, '', 'old-refresh'])(
        'does not persist response token %s',
        async (refreshToken) => {
            const f = setup(true, mode);
            f.lockedExchange.mockResolvedValue({
                accessToken: 'fresh',
                expiresIn: 3600,
                refreshToken,
            } as unknown as Awaited<
                ReturnType<typeof warehouses.refreshDatabricksOAuthToken>
            >);
            const result = await f.resolver.resolve(f.input);
            expect(result.clientCredentials.refreshToken).toBe(
                mode === DatabricksAuthenticationType.OAUTH_M2M
                    ? refreshToken || 'old-refresh'
                    : refreshToken,
            );
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'raw compile keeps omitted response token and error with lock %s',
        async (enabled) => {
            const f = setup(enabled, mode);
            const exchange = enabled ? f.lockedExchange : f.exchange;
            exchange.mockResolvedValue({
                accessToken: 'fresh',
                expiresIn: 3600,
                refreshToken: undefined,
            } as unknown as Awaited<
                ReturnType<typeof warehouses.refreshDatabricksOAuthToken>
            >);
            const policy = {
                errorPolicy: 'raw' as const,
                legacyOwner: null,
                refreshTokenFallback: 'response' as const,
            };
            expect(
                (await f.resolver.refresh(f.input, policy)).clientCredentials
                    .refreshToken,
            ).toBeUndefined();
            const error = new Error('invalid_grant');
            exchange.mockRejectedValue(error);
            await expect(f.resolver.refresh(f.input, policy)).rejects.toBe(
                error,
            );
            expect(f.deps.attributeSharedSignInExpiry).not.toHaveBeenCalled();
        },
    );

    test('maps provider errors and passes existing errors through', async () => {
        const f = setup(true, mode);
        f.lockedExchange.mockRejectedValue(new Error('invalid_grant'));
        await expect(f.resolver.resolve(f.input)).rejects.toThrow(
            mode === DatabricksAuthenticationType.OAUTH_U2M
                ? new DatabricksTokenError(
                      'Error refreshing databricks U2M OAuth token: invalid_grant',
                  )
                : new UnexpectedServerError(
                      'Error refreshing databricks token',
                  ),
        );
        expect(f.deps.attributeSharedSignInExpiry).toHaveBeenCalledOnce();
        const error = new ForbiddenError('refused');
        f.lockedExchange.mockRejectedValue(error);
        await expect(f.resolver.resolve(f.input)).rejects.toBe(error);
    });

    test.each(['input', 'row'] as const)(
        'maps a missing %s token',
        async (source) => {
            const f = setup(true, mode);
            if (source === 'input') f.input.connection.refreshToken = undefined;
            else
                f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
                    { ...f.input.connection, refreshToken: undefined },
                );
            await expect(f.resolver.resolve(f.input)).rejects.toBeInstanceOf(
                mode === DatabricksAuthenticationType.OAUTH_U2M
                    ? DatabricksTokenError
                    : UnexpectedServerError,
            );
            expect(f.lockedExchange).not.toHaveBeenCalled();
        },
    );

    test.each(['transport', 'pool'] as const)(
        'keeps %s timeouts retryable',
        async (source) => {
            const f = setup(true, mode);
            if (source === 'transport')
                f.lockedExchange.mockRejectedValue(
                    new OAuthRequestTimeoutError(),
                );
            else
                f.transaction.mockRejectedValue(
                    Object.assign(new Error('pool'), {
                        name: 'KnexTimeoutError',
                    }),
                );
            await expect(f.resolver.resolve(f.input)).rejects.toBeInstanceOf(
                RefreshTokenLockTimeoutError,
            );
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
        },
    );

    test.each(['host', 'client', 'mode', 'type', 'missing'] as const)(
        'rejects a changed source %s',
        async (change) => {
            const f = setup(true, mode);
            const current = { ...f.input.connection };
            switch (change) {
                case 'host':
                    current.serverHostName = 'other.example.com';
                    break;
                case 'client':
                    current.oauthClientId = 'different-client';
                    break;
                case 'mode':
                    current.authenticationType =
                        DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN;
                    break;
                case 'type':
                    f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
                        { type: WarehouseTypes.SNOWFLAKE },
                    );
                    break;
                case 'missing':
                    f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockRejectedValue(
                        new NotFoundError('gone'),
                    );
                    break;
                default:
                    assertUnreachable(change, 'Unknown fixture');
            }
            if (change !== 'type' && change !== 'missing')
                f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
                    current,
                );
            await expect(f.resolver.resolve(f.input)).rejects.toBeInstanceOf(
                RefreshTokenSourceChangedError,
            );
            expect(f.lockedExchange).not.toHaveBeenCalled();
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
        },
    );

    test.each([
        'project',
        'organization',
        'user',
        'warehouseConnection',
    ] as const)(
        'lock off preserves the legacy %s write without a reread',
        async (kind) => {
            const f = setup(false, mode);
            const owner: CredentialOwner =
                kind === 'user'
                    ? {
                          kind,
                          uuid: 'row',
                          purpose: UserWarehouseCredentialPurpose.DEFAULT,
                      }
                    : { kind, uuid: 'row' };
            await f.resolver.resolve({
                ...f.input,
                owner,
                refreshSource: {
                    credentials: f.input.connection,
                    fallback: f.input.connection,
                    personalCredentialPolicy: { strictPersonalOverlay: false },
                },
            });
            const rotate = {
                project: f.deps.projectModel.rotateRefreshToken,
                organization:
                    f.deps.organizationWarehouseCredentialsModel
                        .rotateRefreshToken,
                user: f.deps.userWarehouseCredentialsModel.rotateRefreshToken,
                warehouseConnection:
                    f.deps.warehouseConnectionModel.rotateRefreshToken,
            }[kind];
            expect(rotate).toHaveBeenCalledExactlyOnceWith(
                ...(kind === 'warehouseConnection' ? [f.project] : []),
                'row',
                'old-refresh',
                'new-refresh',
            );
            expect(f.run).not.toHaveBeenCalled();
            expect(f.lockedExchange).not.toHaveBeenCalled();
            expect(
                f.deps.projectModel.getOwnWarehouseCredentialsForProject,
            ).not.toHaveBeenCalled();
            expect(
                f.deps.organizationWarehouseCredentialsModel
                    .getByUuidWithSensitiveData,
            ).not.toHaveBeenCalled();
            expect(
                f.deps.userWarehouseCredentialsModel.getByUuidWithSecrets,
            ).not.toHaveBeenCalled();
            expect(
                f.deps.warehouseConnectionModel.getOwnCredentials,
            ).not.toHaveBeenCalled();
        },
    );

    test('omitted response tokens use the locked token only for query M2M', async () => {
        const f = setup(true, mode);
        f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
            { ...f.input.connection, refreshToken: 'latest-refresh' },
        );
        f.lockedExchange.mockResolvedValue({
            accessToken: 'fresh',
            expiresIn: 3600,
        } as Awaited<
            ReturnType<typeof warehouses.refreshDatabricksOAuthToken>
        >);
        const result = await f.resolver.resolve(f.input);
        expect(result.clientCredentials.refreshToken).toBe(
            mode === DatabricksAuthenticationType.OAUTH_M2M
                ? 'latest-refresh'
                : undefined,
        );
        expect(f.deps.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    });

    test('normalizes workspace identity and ignores routing fields', async () => {
        const f = setup(true, mode);
        f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
            {
                ...f.input.connection,
                serverHostName: 'https://WORKSPACE.example.com/',
                catalog: 'other-catalog',
                httpPath: '/other',
            },
        );
        expect(
            (await f.resolver.resolve(f.input)).clientCredentials.httpPath,
        ).toBe(credentials.httpPath);
    });

    test.each([true, false])(
        'preserves best effort persistence with lock %s',
        async (enabled) => {
            const f = setup(enabled, mode);
            f.deps.projectModel.rotateRefreshToken.mockRejectedValue(
                new Error('write failed'),
            );
            expect(
                (await f.resolver.resolve(f.input)).clientCredentials.token,
            ).toBe('fresh-access');
            expect(f.deps.logger.error).toHaveBeenCalledWith(
                'Failed to persist rotated OAuth refresh token',
                {
                    sourceKind: 'project',
                    sourceUuid: 'project',
                    error: 'write failed',
                },
            );
            f.deps.projectModel.rotateRefreshToken.mockResolvedValue(false);
            expect(
                (await f.resolver.resolve(f.input)).clientCredentials.token,
            ).toBe('fresh-access');
        },
    );

    test('rejects AI service account owners before exchange', async () => {
        const f = setup(true, mode);
        const owner: CredentialOwner = {
            kind: 'aiServiceAccount',
            uuid: 'row',
            identityUuid: 'identity',
            sourceProjectUuid: 'project',
        };
        await expect(
            f.resolver.resolve({ ...f.input, owner }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            f.resolver.refresh(f.input, {
                errorPolicy: 'raw',
                legacyOwner: owner,
                refreshTokenFallback: 'response',
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(f.lockedExchange).not.toHaveBeenCalled();
        expect(f.clientExchange).not.toHaveBeenCalled();
    });

    test('cache identity contains owner and provider identity without tokens or secrets', () => {
        const f = setup(true, mode);
        const input = {
            ...f.input,
            connection: {
                ...f.input.connection,
                oauthClientId: 'stored-client',
                oauthClientSecret: 'private-secret',
            },
        };
        expect(f.resolver.cacheKeyIdentity(input)).toEqual([
            'databricks-oauth',
            mode,
            credentials.serverHostName,
            'stored-client',
            'project',
            'project',
            null,
        ]);
        expect(
            f.resolver.cacheKeyIdentity({
                ...input,
                connection: {
                    ...input.connection,
                    token: 'other-token',
                    refreshToken: 'other-refresh',
                    oauthClientSecret: 'other-secret',
                    catalog: 'other',
                },
            }),
        ).toEqual(f.resolver.cacheKeyIdentity(input));
        expect(
            f.resolver.cacheKeyIdentity({
                ...input,
                owner: { kind: 'organization', uuid: 'row' },
            }),
        ).not.toEqual(f.resolver.cacheKeyIdentity(input));
    });

    test('same row shares one deferred exchange and guarded write, preserving routing fields', async () => {
        const f = setup(true, mode);
        const pending = deferred<{
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
        }>();
        f.lockedExchange.mockReturnValue(pending.promise);
        const first = f.resolver.resolve(f.input);
        await vi.waitFor(() => expect(f.lockedExchange).toHaveBeenCalledOnce());
        const second = f.resolver.resolve({
            ...f.input,
            connection: {
                ...f.input.connection,
                httpPath: '/other-warehouse',
                catalog: 'other',
            },
        });
        await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(2));
        pending.resolve({
            accessToken: 'shared',
            expiresIn: 3600,
            refreshToken: 'rotated',
        });
        const results = await Promise.all([first, second]);
        expect(results.map((r) => r.clientCredentials.token)).toEqual([
            'shared',
            'shared',
        ]);
        expect(results.map((r) => r.clientCredentials.httpPath)).toEqual([
            credentials.httpPath,
            '/other-warehouse',
        ]);
        expect(f.lockedExchange).toHaveBeenCalledOnce();
        expect(
            f.deps.projectModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith('project', 'old-refresh', 'rotated', {
            raw: f.raw,
        });
        expect(f.transaction).toHaveBeenCalledOnce();
    });

    test('different rows exchange independently', async () => {
        const f = setup(true, mode);
        const pending = deferred<{
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
        }>();
        f.lockedExchange.mockReturnValue(pending.promise);
        const first = f.resolver.resolve(f.input);
        const second = f.resolver.resolve({
            ...f.input,
            owner: { kind: 'project', uuid: 'other-row' },
        });
        await vi.waitFor(() =>
            expect(f.lockedExchange).toHaveBeenCalledTimes(2),
        );
        pending.resolve({
            accessToken: 'access',
            expiresIn: 3600,
            refreshToken: 'rotated',
        });
        await Promise.all([first, second]);
        expect(f.deps.projectModel.rotateRefreshToken.mock.calls).toEqual([
            ['project', 'old-refresh', 'rotated', { raw: f.raw }],
            ['other-row', 'old-refresh', 'rotated', { raw: f.raw }],
        ]);
        expect(f.transaction).toHaveBeenCalledTimes(2);
    });
});

describe('Databricks client selection and save', () => {
    test.each(modes)(
        'stored, configured and default client precedence for %s',
        async (mode) => {
            const f = setup(false, mode);
            f.input.connection.oauthClientId = 'stored-client';
            f.input.connection.oauthClientSecret = 'stored-secret';
            await f.resolver.resolve(f.input);
            expect(f.exchange).toHaveBeenLastCalledWith(
                credentials.serverHostName,
                'stored-client',
                'old-refresh',
                mode === DatabricksAuthenticationType.OAUTH_U2M
                    ? undefined
                    : 'stored-secret',
            );
            f.input.connection.oauthClientId = 'config-client';
            await f.resolver.resolve(f.input);
            expect(f.exchange).toHaveBeenLastCalledWith(
                credentials.serverHostName,
                'config-client',
                'old-refresh',
                mode === DatabricksAuthenticationType.OAUTH_U2M
                    ? 'config-secret'
                    : 'stored-secret',
            );
            delete f.input.connection.oauthClientId;
            await f.resolver.resolve(f.input);
            expect(f.exchange).toHaveBeenLastCalledWith(
                credentials.serverHostName,
                'config-client',
                'old-refresh',
                'config-secret',
            );
            f.deps.lightdashConfig.auth.databricks.clientId = '';
            await f.resolver.resolve(f.input);
            expect(f.exchange).toHaveBeenLastCalledWith(
                credentials.serverHostName,
                warehouses.DATABRICKS_DEFAULT_OAUTH_CLIENT_ID,
                'old-refresh',
                undefined,
            );
        },
    );

    test.each([true, false])(
        'M2M client credentials never lock with flag %s',
        async (enabled) => {
            const f = setup(enabled, DatabricksAuthenticationType.OAUTH_M2M);
            f.input.connection = {
                ...f.input.connection,
                refreshToken: undefined,
                oauthClientId: 'stored',
                oauthClientSecret: 'secret',
            };
            const result = await f.resolver.resolve(f.input);
            expect(result.clientCredentials).toMatchObject({
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                token: 'fresh-access',
                refreshToken: 'new-refresh',
            });
            expect(f.clientExchange).toHaveBeenCalledExactlyOnceWith(
                credentials.serverHostName,
                'stored',
                'secret',
            );
            expect(f.run).not.toHaveBeenCalled();
            expect(f.exchange).not.toHaveBeenCalled();
            expect(f.deps.featureFlagModel.get).not.toHaveBeenCalled();
        },
    );

    test('M2M refresh token takes precedence over the client credentials grant', async () => {
        const f = setup(false, DatabricksAuthenticationType.OAUTH_M2M);
        f.input.connection = {
            ...f.input.connection,
            oauthClientId: 'stored',
            oauthClientSecret: 'secret',
        };
        await f.resolver.resolve(f.input);
        expect(f.exchange).toHaveBeenCalledExactlyOnceWith(
            credentials.serverHostName,
            'stored',
            'old-refresh',
            'secret',
        );
        expect(f.clientExchange).not.toHaveBeenCalled();
    });

    test.each(['submitted', 'person'] as const)(
        'U2M save retains the original %s token and marks it prepared',
        async (source) => {
            const f = setup();
            if (source === 'person')
                f.input.connection.refreshToken = undefined;
            const result = await f.resolver.validateOnSave({
                ...f.input,
                intent: { kind: 'preserve' },
            });
            expect(result.stored).toMatchObject({
                token: 'fresh-access',
                refreshToken:
                    source === 'person' ? 'person-refresh' : 'old-refresh',
            });
            expect(
                (result.connection as PreparedCredentials)[preparedCredentials],
            ).toBe(true);
            expect(
                f.deps.userWarehouseCredentialsModel
                    .findDatabricksOauthU2mForHostWithSecrets,
            ).toHaveBeenCalledTimes(source === 'person' ? 1 : 0);
            if (source === 'person')
                expect(
                    f.deps.userWarehouseCredentialsModel
                        .findDatabricksOauthU2mForHostWithSecrets,
                ).toHaveBeenCalledWith('person', credentials.serverHostName, {
                    strictPersonalOverlay: true,
                });
            expect(f.run).not.toHaveBeenCalled();
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
        },
    );

    test('save reports a missing host-matching U2M credential', async () => {
        const f = setup();
        f.input.connection.refreshToken = undefined;
        f.deps.userWarehouseCredentialsModel.findDatabricksOauthU2mForHostWithSecrets.mockResolvedValue(
            undefined,
        );
        await expect(
            f.resolver.validateOnSave({
                ...f.input,
                intent: { kind: 'linkCurrentPerson', userUuid: 'person' },
            }),
        ).rejects.toThrow(
            new NotFoundError(
                `No Databricks OAuth credentials found for workspace ${credentials.serverHostName}. Please sign in with Databricks for this workspace and try again.`,
            ),
        );
        expect(f.exchange).not.toHaveBeenCalled();
    });

    test('M2M save exchanges and prepares the returned credentials', async () => {
        const f = setup(true, DatabricksAuthenticationType.OAUTH_M2M);
        f.input.connection = {
            ...f.input.connection,
            refreshToken: undefined,
            oauthClientId: 'stored',
            oauthClientSecret: 'secret',
        };
        const result = await f.resolver.validateOnSave({
            ...f.input,
            intent: { kind: 'preserve' },
        });
        expect(result.stored).toMatchObject({
            token: 'fresh-access',
            refreshToken: 'new-refresh',
        });
        expect(
            (result.connection as PreparedCredentials)[preparedCredentials],
        ).toBe(true);
        expect(f.clientExchange).toHaveBeenCalledOnce();
        expect(f.run).not.toHaveBeenCalled();
    });
});

test.each([1, 2])(
    'attributes the attempted reread token for %s caller(s) of a failed flight',
    async (callers) => {
        const f = setup(true);
        const stored = {
            ...f.input.connection,
            refreshToken: 'current-refresh',
        };
        f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
            stored,
        );
        const attributed = new DatabricksTokenError(
            'The shared sign-in must reconnect',
        );
        f.deps.attributeSharedSignInExpiry.mockImplementation(
            async (_uuid, connection, error) => {
                if (connection.refreshToken === stored.refreshToken)
                    throw attributed;
                throw error;
            },
        );
        const pending =
            deferred<
                Awaited<
                    ReturnType<typeof warehouses.refreshDatabricksOAuthToken>
                >
            >();
        f.lockedExchange.mockReturnValue(pending.promise);
        const requests = [f.resolver.resolve(f.input)];
        await vi.waitFor(() => expect(f.lockedExchange).toHaveBeenCalledOnce());
        if (callers === 2) {
            requests.push(
                f.resolver.resolve({
                    ...f.input,
                    connection: {
                        ...f.input.connection,
                        refreshToken: 'another-selected-refresh',
                    },
                }),
            );
            await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(2));
        }
        const outcomes = Promise.allSettled(requests);
        pending.reject(new Error('invalid_grant'));
        expect(await outcomes).toEqual(
            Array.from({ length: callers }, () => ({
                status: 'rejected',
                reason: attributed,
            })),
        );
        expect(f.lockedExchange).toHaveBeenCalledExactlyOnceWith(
            credentials.serverHostName,
            'config-client',
            'current-refresh',
            'config-secret',
        );
        expect(f.deps.attributeSharedSignInExpiry).toHaveBeenCalledTimes(
            callers,
        );
        expect(f.deps.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    },
);

test('rejects removal of a personal client when it changes the effective client', async () => {
    const f = setup(true);
    const personal = { ...credentials, oauthClientId: 'person-client' };
    f.deps.userWarehouseCredentialsModel.getByUuidWithSecrets.mockResolvedValue(
        { credentials },
    );
    await expect(
        f.resolver.resolve({
            ...f.input,
            connection: personal,
            owner: {
                kind: 'user',
                uuid: 'user-row',
                purpose: UserWarehouseCredentialPurpose.DEFAULT,
            },
            refreshSource: {
                credentials: personal,
                fallback: f.input.connection,
                personalCredentialPolicy: { strictPersonalOverlay: false },
            },
        }),
    ).rejects.toBeInstanceOf(RefreshTokenSourceChangedError);
    expect(f.lockedExchange).not.toHaveBeenCalled();
});

describe('strict personal overlay (agent-identity on)', () => {
    test.each([true, false])(
        'provider matching uses the explicit personal policy (%s)',
        async (supplied) => {
            const f = setup(true, DatabricksAuthenticationType.OAUTH_U2M);
            const selected = {
                ...f.input.connection,
                oauthClientId: undefined,
            };
            f.deps.userWarehouseCredentialsModel.getByUuidWithSecrets.mockResolvedValue(
                {
                    credentials: {
                        ...selected,
                        oauthClientId: 'connection-client',
                    },
                },
            );
            const resolution = f.resolver.resolve({
                ...f.input,
                connection: selected,
                stored: selected,
                owner: {
                    kind: 'user',
                    uuid: 'personal',
                    purpose: UserWarehouseCredentialPurpose.DEFAULT,
                },
                refreshSource: {
                    credentials: selected,
                    fallback: {
                        ...selected,
                        authenticationType:
                            DatabricksAuthenticationType.OAUTH_M2M,
                        oauthClientId: 'connection-client',
                    },
                    personalCredentialPolicy: {
                        strictPersonalOverlay: supplied,
                    },
                },
            });
            if (supplied) {
                await expect(resolution).rejects.toBeInstanceOf(
                    RefreshTokenSourceChangedError,
                );
                expect(f.lockedExchange).not.toHaveBeenCalled();
            } else {
                await expect(resolution).resolves.toMatchObject({
                    clientCredentials: { token: 'fresh-access' },
                });
                expect(f.lockedExchange).toHaveBeenCalledOnce();
            }
        },
    );
});
