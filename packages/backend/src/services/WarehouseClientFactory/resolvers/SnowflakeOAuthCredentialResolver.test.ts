import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    SnowflakeAuthenticationType,
    SnowflakeTokenError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AiExecutionPlan,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import {
    OAUTH_REQUEST_TIMEOUT_MS,
    OAuthRequestTimeoutError,
} from '../../../auth/oauthRequestDeadline';
import {
    createDatabase,
    deferred,
} from '../../../models/RefreshTokenRotation/fakeKnex.mock';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRotation,
    RefreshTokenSourceChangedError,
} from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import { UserService } from '../../UserService';
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
import { CredentialResolverRegistry } from '../CredentialResolverRegistry';
import { SnowflakeOAuthCredentialResolver } from './SnowflakeOAuthCredentialResolver';

const credentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.SSO,
    account: 'account',
    user: 'person',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'schema',
    role: 'role',
    token: 'stale-access',
    refreshToken: 'old-refresh',
};
const selection = (): CredentialSelection<CreateSnowflakeCredentials> => ({
    connection: { ...credentials },
    stored: { ...credentials },
    owner: { kind: 'project', uuid: 'project' },
    context: connectionContextFromUser(
        { userUuid: 'person' },
        {
            organizationUuid: 'org',
            queryContext: null,
        },
    ),
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    credentialKind: WarehouseCredentialKind.SHARED,
    aiPlan: null,
});
const setup = (enabled = true) => {
    const { database, transaction, raw } = createDatabase();
    const coordinator = new RefreshTokenRotation({ database });
    const run = vi.spyOn(coordinator, 'run');
    const project = {
        projectUuid: 'project',
        organizationUuid: 'org',
        connectionMode: 'multi' as const,
        originalWarehouseType: WarehouseTypes.SNOWFLAKE,
    };
    const deps = {
        refreshTokenRotation: coordinator,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue(project),
            getOwnWarehouseCredentialsForProject: vi
                .fn()
                .mockResolvedValue(credentials),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        organizationWarehouseCredentialsModel: {
            getByUuidWithSensitiveData: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org', credentials }),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        userWarehouseCredentialsModel: {
            getByUuidWithSecrets: vi.fn().mockResolvedValue({ credentials }),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        warehouseConnectionModel: {
            getProject: vi.fn().mockResolvedValue(project),
            getOwnCredentials: vi.fn().mockResolvedValue(credentials),
            rotateRefreshToken: vi.fn().mockResolvedValue(true),
        },
        userOAuthGrantsModel: {
            getRefreshToken: vi.fn().mockResolvedValue('grant-refresh'),
        },
        logger: { debug: vi.fn(), error: vi.fn() },
        attributeSharedSignInExpiry: vi.fn(
            async (
                _uuid: string,
                _credentials: CreateSnowflakeCredentials,
                error: unknown,
            ): Promise<never> => {
                throw error;
            },
        ),
    };
    const resolver = new SnowflakeOAuthCredentialResolver(deps);
    const exchange = vi
        .spyOn(UserService, 'generateSnowflakeAccessToken')
        .mockResolvedValue({
            accessToken: 'fresh-access',
            refreshToken: 'new-refresh',
        });
    return { resolver, deps, exchange, run, transaction, project, raw };
};
afterEach(() => vi.restoreAllMocks());

describe('SnowflakeOAuthCredentialResolver', () => {
    test('sets the token without changing stored connection fields or leaking secrets in cache identity', async () => {
        const f = setup();
        const input = selection();
        const result = await f.resolver.resolve(input);
        expect(result).toEqual({
            clientCredentials: {
                ...credentials,
                token: 'fresh-access',
                refreshToken: 'new-refresh',
            },
            clientOptions: {},
            cacheable: true,
        });
        expect(input.stored).toEqual(credentials);
        expect(f.resolver.cacheKeyIdentity(input)).toEqual([
            'snowflake-oauth',
            'project',
            'project',
            null,
        ]);
        await expect(f.resolver.dispose()).resolves.toBeUndefined();
        expect(f.deps.featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
            user: { organizationUuid: 'org' },
            featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
        });
    });

    test('save loads the person grant, retains its original refresh token and never writes', async () => {
        const f = setup();
        const input = {
            ...selection(),
            intent: { kind: 'linkCurrentPerson' as const, userUuid: 'person' },
        };
        const validated = await f.resolver.validateOnSave(input);
        expect(validated.stored).toEqual({
            ...credentials,
            token: 'fresh-access',
            refreshToken: 'grant-refresh',
        });
        expect(validated.connection).toMatchObject(validated.stored);
        expect(
            (validated.connection as PreparedCredentials)[preparedCredentials],
        ).toBe(true);
        expect(f.exchange).toHaveBeenCalledExactlyOnceWith('grant-refresh');
        expect(f.run).not.toHaveBeenCalled();
        expect(f.deps.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        expect(
            f.deps.userWarehouseCredentialsModel.rotateRefreshToken,
        ).not.toHaveBeenCalled();
    });

    test('preserve save leaves supplied credentials alone', async () => {
        const f = setup();
        const input = selection();
        expect(
            await f.resolver.validateOnSave({
                ...input,
                intent: { kind: 'preserve' },
            }),
        ).toEqual({
            connection: input.connection,
            stored: input.stored,
        });
        expect(f.exchange).not.toHaveBeenCalled();
    });

    test.each([
        'project',
        'organization',
        'user',
        'warehouseConnection',
    ] as const)(
        'persists a %s owner rotation through its model',
        async (kind) => {
            const f = setup();
            const input = selection();
            input.owner =
                kind === 'user'
                    ? {
                          kind,
                          uuid: 'row',
                          purpose: UserWarehouseCredentialPurpose.DEFAULT,
                      }
                    : { kind, uuid: 'row' };
            await f.resolver.resolve(input);
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
                ...(kind === 'user' ? [undefined] : []),
                { raw: f.raw },
            );
            expect(f.run).toHaveBeenCalledTimes(1);
        },
    );

    test('uses the current row token under the lock', async () => {
        const f = setup();
        f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
            { ...credentials, refreshToken: 'current-refresh' },
        );
        await f.resolver.resolve(selection());
        expect(f.exchange).toHaveBeenCalledExactlyOnceWith(
            'current-refresh',
            OAUTH_REQUEST_TIMEOUT_MS,
        );
        expect(
            f.deps.projectModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            'project',
            'current-refresh',
            'new-refresh',
            { raw: f.raw },
        );
    });

    test.each([true, false])(
        'does not write an unchanged token with lock %s',
        async (enabled) => {
            const f = setup(enabled);
            f.exchange.mockResolvedValue({
                accessToken: 'fresh',
                refreshToken: 'old-refresh',
            });
            await f.resolver.resolve(selection());
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'logs and swallows persistence errors with lock %s',
        async (enabled) => {
            const f = setup(enabled);
            f.deps.projectModel.rotateRefreshToken.mockRejectedValue(
                new Error('write failed'),
            );
            expect(
                (await f.resolver.resolve(selection())).clientCredentials.token,
            ).toBe('fresh-access');
            expect(f.deps.logger.error).toHaveBeenCalledWith(
                'Failed to persist rotated OAuth refresh token',
                {
                    sourceKind: 'project',
                    sourceUuid: 'project',
                    error: 'write failed',
                },
            );
        },
    );

    test.each(['OAuth refresh token expired', 'invalid_grant'])(
        'preserves parsed Snowflake error: %s',
        async (message) => {
            const f = setup();
            f.exchange.mockRejectedValue({ data: JSON.stringify({ message }) });
            await expect(f.resolver.resolve(selection())).rejects.toThrow(
                new SnowflakeTokenError(
                    `Error refreshing snowflake token: ${message}`,
                ),
            );
            expect(f.deps.attributeSharedSignInExpiry).toHaveBeenCalledTimes(1);
        },
    );

    test.each([true, false])(
        'attributes grant expiry to the sent token with lock %s',
        async (enabled) => {
            const f = setup(enabled);
            const input = selection();
            f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
                {
                    ...credentials,
                    refreshToken: 'rotated-refresh',
                },
            );
            f.exchange.mockRejectedValue({
                data: JSON.stringify({ message: 'invalid_grant' }),
            });
            const mapped = new SnowflakeTokenError(
                'Error refreshing snowflake token: invalid_grant',
            );
            await expect(f.resolver.resolve(input)).rejects.toThrow(mapped);
            expect(f.exchange).toHaveBeenCalledExactlyOnceWith(
                enabled ? 'rotated-refresh' : input.connection.refreshToken,
                ...(enabled ? [OAUTH_REQUEST_TIMEOUT_MS] : []),
            );
            expect(
                f.deps.attributeSharedSignInExpiry,
            ).toHaveBeenCalledExactlyOnceWith(
                'project',
                enabled
                    ? { ...input.connection, refreshToken: 'rotated-refresh' }
                    : input.connection,
                mapped,
            );
        },
    );

    test('passes Lightdash errors through unchanged', async () => {
        const f = setup();
        const error = new ForbiddenError('refused');
        f.exchange.mockRejectedValue(error);
        await expect(f.resolver.resolve(selection())).rejects.toBe(error);
    });

    test.each(['input', 'row'] as const)(
        'maps a missing %s refresh token to the existing error',
        async (source) => {
            const f = setup();
            const input = selection();
            if (source === 'input') input.connection.refreshToken = undefined;
            else
                f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockResolvedValue(
                    { ...credentials, refreshToken: undefined },
                );
            await expect(f.resolver.resolve(input)).rejects.toThrow(
                new SnowflakeTokenError('Error refreshing snowflake token'),
            );
            expect(f.exchange).not.toHaveBeenCalled();
        },
    );

    test.each(['transport', 'pool'] as const)(
        'keeps %s timeouts retryable',
        async (source) => {
            const f = setup();
            if (source === 'transport')
                f.exchange.mockRejectedValue(new OAuthRequestTimeoutError());
            else
                f.transaction.mockRejectedValue(
                    Object.assign(new Error('Pool exhausted'), {
                        name: 'KnexTimeoutError',
                    }),
                );
            await expect(
                f.resolver.resolve(selection()),
            ).rejects.toBeInstanceOf(RefreshTokenLockTimeoutError);
            expect(
                f.deps.projectModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
        },
    );

    test('keeps lock timeouts retryable', async () => {
        const f = setup();
        const error = new RefreshTokenLockTimeoutError();
        f.run.mockRejectedValue(error);
        await expect(f.resolver.resolve(selection())).rejects.toBe(error);
    });

    test.each([
        'project',
        'warehouseConnection',
        'organization',
        'user',
    ] as const)(
        'refuses a changed or removed %s source without exchanging or writing',
        async (kind) => {
            const f = setup();
            const readers = {
                project:
                    f.deps.projectModel.getOwnWarehouseCredentialsForProject,
                warehouseConnection:
                    f.deps.warehouseConnectionModel.getOwnCredentials,
                organization:
                    f.deps.organizationWarehouseCredentialsModel
                        .getByUuidWithSensitiveData,
                user: f.deps.userWarehouseCredentialsModel.getByUuidWithSecrets,
            };
            const acquired = deferred<void>();
            f.raw
                .mockResolvedValueOnce(undefined)
                .mockImplementationOnce(() => acquired.promise);
            const pending = f.resolver.resolve({
                ...selection(),
                owner:
                    kind === 'user'
                        ? {
                              kind,
                              uuid: 'row',
                              purpose: UserWarehouseCredentialPurpose.DEFAULT,
                          }
                        : { kind, uuid: 'row' },
            });
            await vi.waitFor(() => expect(f.raw).toHaveBeenCalledTimes(2));
            expect(readers[kind]).not.toHaveBeenCalled();
            readers[kind].mockRejectedValue(
                kind === 'organization' || kind === 'user'
                    ? new NotFoundError('Credential removed')
                    : new RefreshTokenSourceChangedError(),
            );
            acquired.resolve();
            await expect(pending).rejects.toMatchObject({
                data: {
                    code: 'warehouse_oauth_refresh_failed',
                    retryable: true,
                },
            });
            expect(f.exchange).not.toHaveBeenCalled();
            for (const model of [
                f.deps.projectModel,
                f.deps.warehouseConnectionModel,
                f.deps.organizationWarehouseCredentialsModel,
                f.deps.userWarehouseCredentialsModel,
            ]) {
                expect(model.rotateRefreshToken).not.toHaveBeenCalled();
            }
        },
    );

    test('owner null exchanges without a flag read, lock or write', async () => {
        const f = setup();
        await f.resolver.resolve({ ...selection(), owner: null });
        expect(f.exchange).toHaveBeenCalledTimes(1);
        expect(f.run).not.toHaveBeenCalled();
        expect(f.deps.featureFlagModel.get).not.toHaveBeenCalled();
        expect(f.deps.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    });

    test('rejects service account and unchecked AI credentials', async () => {
        const f = setup();
        await Promise.all(
            (
                [
                    {
                        kind: 'aiServiceAccount',
                        uuid: 'row',
                        identityUuid: 'identity',
                        sourceProjectUuid: 'project',
                    },
                    {
                        kind: 'user',
                        uuid: 'row',
                        purpose: UserWarehouseCredentialPurpose.AI,
                    },
                ] satisfies CredentialOwner[]
            ).map(async (owner) => {
                await expect(
                    f.resolver.resolve({ ...selection(), owner }),
                ).rejects.toBeInstanceOf(ForbiddenError);
            }),
        );
        expect(f.exchange).not.toHaveBeenCalled();
    });

    test('passes minted connected-person AI credentials through unchanged', async () => {
        const f = setup();
        const input = {
            ...selection(),
            owner: {
                kind: 'user' as const,
                uuid: 'row',
                purpose: UserWarehouseCredentialPurpose.AI,
            },
            aiPlan: { identity: 'connected_person' } as AiExecutionPlan,
        };
        expect((await f.resolver.resolve(input)).clientCredentials).toBe(
            input.connection,
        );
        expect(f.exchange).not.toHaveBeenCalled();
        expect(f.run).not.toHaveBeenCalled();
    });

    test('prepared save credentials bypass a second registry refresh after a spread', async () => {
        const f = setup();
        const registry = new CredentialResolverRegistry();
        registry.register(
            WarehouseTypes.SNOWFLAKE,
            SnowflakeAuthenticationType.SSO,
            f.resolver,
        );
        const input = selection();
        const validated = await f.resolver.validateOnSave({
            ...input,
            intent: { kind: 'linkCurrentPerson', userUuid: 'person' },
        });
        const result = await registry.resolveCredentialSelection(
            { ...input, connection: { ...validated.connection } },
            vi.fn(),
        );
        expect(result).toMatchObject({ token: 'fresh-access' });
        expect(f.exchange).toHaveBeenCalledTimes(1);
    });

    test('lock off uses the submitted token and legacy CAS without a coordinator call', async () => {
        const f = setup(false);
        await f.resolver.resolve(selection());
        expect(f.run).not.toHaveBeenCalled();
        expect(
            f.deps.projectModel.getOwnWarehouseCredentialsForProject,
        ).not.toHaveBeenCalled();
        expect(f.exchange).toHaveBeenCalledExactlyOnceWith('old-refresh');
        expect(
            f.deps.projectModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            'project',
            'old-refresh',
            'new-refresh',
        );
    });

    test.each(['project', 'organization'] as const)(
        'shares one %s row exchange between concurrent callers',
        async (kind) => {
            const f = setup();
            let release!: (value: {
                accessToken: string;
                refreshToken: string;
            }) => void;
            let started!: () => void;
            const start = new Promise<void>((resolve) => {
                started = resolve;
            });
            f.exchange.mockImplementation(() => {
                started();
                return new Promise((resolve) => {
                    release = resolve;
                });
            });
            const input = {
                ...selection(),
                owner: { kind, uuid: 'shared-row' },
            };
            const first = f.resolver.resolve(input);
            await start;
            const second = f.resolver.resolve({
                ...input,
                projectUuid:
                    kind === 'organization'
                        ? 'other-project'
                        : input.projectUuid,
                connection: { ...input.connection, schema: 'other-schema' },
            });
            await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(2));
            release({
                accessToken: 'shared-access',
                refreshToken: 'shared-refresh',
            });
            const results = await Promise.all([first, second]);
            expect(
                results.map((result) => result.clientCredentials.token),
            ).toEqual(['shared-access', 'shared-access']);
            expect(results[1].clientCredentials.schema).toBe('other-schema');
            expect(f.exchange).toHaveBeenCalledTimes(1);
            expect(f.transaction).toHaveBeenCalledTimes(1);
            expect(
                kind === 'project'
                    ? f.deps.projectModel.rotateRefreshToken
                    : f.deps.organizationWarehouseCredentialsModel
                          .rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'shared-row',
                'old-refresh',
                'shared-refresh',
                { raw: f.raw },
            );
        },
    );
});

describe('Snowflake OAuth refresh concurrency', () => {
    test.each(['project', 'organization'] as const)(
        'shares an exchange and write for concurrent callers on one %s row',
        async (kind) => {
            const f = setup();
            const exchanged = deferred<{
                accessToken: string;
                refreshToken: string;
            }>();
            f.exchange.mockReturnValue(exchanged.promise);
            const firstInput = selection();
            const secondInput = selection();
            if (kind === 'organization') {
                firstInput.owner = { kind, uuid: 'shared-org-row' };
                secondInput.owner = { kind, uuid: 'shared-org-row' };
                secondInput.projectUuid = 'another-project';
            }
            secondInput.connection = {
                ...secondInput.connection,
                warehouse: 'other-warehouse',
            };
            const first = f.resolver.resolve(firstInput);
            await vi.waitFor(() => expect(f.exchange).toHaveBeenCalledTimes(1));
            const second = f.resolver.resolve(secondInput);
            await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(2));
            expect(f.exchange).toHaveBeenCalledTimes(1);
            exchanged.resolve({
                accessToken: 'shared-access',
                refreshToken: 'rotated-refresh',
            });
            const results = await Promise.all([first, second]);
            expect(
                results.map((result) => result.clientCredentials.token),
            ).toEqual(['shared-access', 'shared-access']);
            expect(
                results.map((result) => result.clientCredentials.warehouse),
            ).toEqual(['warehouse', 'other-warehouse']);
            const model =
                kind === 'project'
                    ? f.deps.projectModel
                    : f.deps.organizationWarehouseCredentialsModel;
            expect(model.rotateRefreshToken).toHaveBeenCalledExactlyOnceWith(
                firstInput.owner!.uuid,
                'old-refresh',
                'rotated-refresh',
                { raw: f.raw },
            );
            expect(f.transaction).toHaveBeenCalledTimes(1);
        },
    );

    test('exchanges independently for different project rows', async () => {
        const f = setup();
        const exchanged = deferred<{
            accessToken: string;
            refreshToken: string;
        }>();
        f.exchange.mockReturnValue(exchanged.promise);
        const first = f.resolver.resolve(selection());
        const second = f.resolver.resolve({
            ...selection(),
            owner: { kind: 'project', uuid: 'other-project' },
        });
        await vi.waitFor(() => expect(f.exchange).toHaveBeenCalledTimes(2));
        exchanged.resolve({ accessToken: 'access', refreshToken: 'rotated' });
        await Promise.all([first, second]);
        expect(f.deps.projectModel.rotateRefreshToken).toHaveBeenCalledTimes(2);
        expect(f.transaction).toHaveBeenCalledTimes(2);
    });

    test('rereads the rotated token for a caller after the first refresh completes', async () => {
        const f = setup();
        let stored = credentials;
        f.deps.projectModel.getOwnWarehouseCredentialsForProject.mockImplementation(
            async () => stored,
        );
        f.deps.projectModel.rotateRefreshToken.mockImplementation(
            async (_uuid, _old, next) => {
                stored = { ...stored, refreshToken: next };
                return true;
            },
        );
        await f.resolver.resolve(selection());
        await f.resolver.resolve(selection());
        expect(f.exchange.mock.calls).toEqual([
            ['old-refresh', OAUTH_REQUEST_TIMEOUT_MS],
            ['new-refresh', OAUTH_REQUEST_TIMEOUT_MS],
        ]);
        expect(f.transaction).toHaveBeenCalledTimes(2);
    });
});
