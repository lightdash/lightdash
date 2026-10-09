import {
    AiAccessRefusalReason,
    FeatureFlags,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { checkSnowflakeAgentSessionWithToken } from '@lightdash/warehouses';
import { DatabaseError } from 'pg';
import {
    OAUTH_REQUEST_TIMEOUT_MS,
    OAuthRequestTimeoutError,
} from '../../../auth/oauthRequestDeadline';
import * as refreshModule from '../../../auth/snowflakeOAuthRefresh';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import {
    createDatabase,
    deferred,
} from '../../../models/RefreshTokenRotation/fakeKnex.mock';
import { RefreshTokenRotation } from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import {
    type AiUserWarehouseCredentials,
    type UserWarehouseCredentialsModel,
} from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { snowflakeAgentClientMock } from '../../AiAccessService/SnowflakeAgentClientResolver.mock';
import { AgentSignInResolverHarness } from './SnowflakeAgentSignInCredentialResolver.mock';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    checkSnowflakeAgentSessionWithToken: vi.fn(),
}));
beforeEach(() => {
    vi.mocked(checkSnowflakeAgentSessionWithToken).mockResolvedValue({
        agentActivated: true,
        currentRole: 'role',
        activeRestrictedSessionScopes: 'scope',
    });
});

const connection: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'connection-user',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'public',
    requireUserCredentials: true,
};
const credential = {
    uuid: 'credential',
    expiresAt: null,
    credentials: {
        type: WarehouseTypes.SNOWFLAKE,
        user: 'person-user',
        authenticationType: SnowflakeAuthenticationType.SSO,
        refreshToken: 'old-refresh',
    },
} satisfies AiUserWarehouseCredentials;
const args = {
    connection,
    silentRefresh: true,
    organizationUuid: 'log-org',
    evaluationKind: 'query' as const,
    person: {
        organizationUuid: 'org',
        userUuid: 'person',
        email: 'person@example.test',
    },
};
const tokens: refreshModule.SnowflakeRefreshResult = {
    accessToken: 'fresh-access',
    refreshToken: 'new-refresh',
    accessTokenExpiresAt: new Date('2099-01-01'),
    refreshTokenExpiresAt: null,
};
const setup = (enabled = true) => {
    const { database, raw, transaction } = createDatabase();
    const coordinator = new RefreshTokenRotation({ database });
    const run = vi.spyOn(coordinator, 'run');
    const model = {
        findAiCredentialWithSecrets: vi
            .fn<UserWarehouseCredentialsModel['findAiCredentialWithSecrets']>()
            .mockResolvedValue(credential),
        rotateRefreshToken: vi
            .fn<UserWarehouseCredentialsModel['rotateRefreshToken']>()
            .mockResolvedValue(true),
    };
    const deps = {
        lightdashConfig: lightdashConfigMock,
        snowflakeAgentClientResolver: {
            resolve: vi.fn().mockResolvedValue(snowflakeAgentClientMock),
        },
        userWarehouseCredentialsModel:
            model as unknown as UserWarehouseCredentialsModel,
        refreshTokenRotation: coordinator,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
    };
    const exchange = vi
        .spyOn(refreshModule, 'exchangeSnowflakeRefreshToken')
        .mockResolvedValue(tokens);
    return {
        provider: new AgentSignInResolverHarness(deps),
        deps,
        model,
        exchange,
        run,
        raw,
        transaction,
    };
};
afterEach(() => vi.restoreAllMocks());

describe('Snowflake agent refresh locking', () => {
    test.each([true, false])(
        'keeps the transport deadline retryable with silent refresh %s',
        async (silentRefresh) => {
            const f = setup();
            f.exchange.mockRejectedValue(new OAuthRequestTimeoutError());
            await expect(
                f.provider.mint({ ...args, silentRefresh }),
            ).rejects.toMatchObject({
                data: {
                    code: 'warehouse_oauth_refresh_failed',
                    retryable: true,
                },
            });
            expect(f.model.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'shares an exchange and guarded write with silent refresh %s',
        async (silentRefresh) => {
            const f = setup();
            const exchanged = deferred<refreshModule.SnowflakeRefreshResult>();
            f.exchange.mockReturnValue(exchanged.promise);
            const first = f.provider.mint({ ...args, silentRefresh });
            await vi.waitFor(() => expect(f.exchange).toHaveBeenCalledTimes(1));
            const follower = new AgentSignInResolverHarness(f.deps);
            const second = follower.mint({
                ...args,
                silentRefresh,
                connection: { ...connection, warehouse: 'other-warehouse' },
            });
            await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(2));
            expect(f.exchange).toHaveBeenCalledTimes(1);
            exchanged.resolve(tokens);
            const results = await Promise.all([first, second]);
            expect(results.map((result) => result.credentials.token)).toEqual([
                'fresh-access',
                'fresh-access',
            ]);
            expect(
                results.map((result) => result.credentials.warehouse),
            ).toEqual(['warehouse', 'other-warehouse']);
            expect(results[0]).toMatchObject({
                identityUuid: 'credential',
                credentials: {
                    user: 'person-user',
                    refreshToken: 'new-refresh',
                    requireAgentSession: true,
                    requireUserCredentials: false,
                },
                assurances: [
                    { kind: 'agent_session_active' },
                    { kind: 'result_cache_off' },
                ],
            });
            if (silentRefresh) {
                expect(results[0].expiresAt).toEqual(
                    tokens.accessTokenExpiresAt,
                );
                expect(
                    f.model.rotateRefreshToken,
                ).toHaveBeenCalledExactlyOnceWith(
                    'credential',
                    'old-refresh',
                    'new-refresh',
                    { kind: 'unreported' },
                    { raw: f.raw },
                );
            } else {
                expect(
                    f.model.rotateRefreshToken,
                ).toHaveBeenCalledExactlyOnceWith(
                    'credential',
                    'old-refresh',
                    'new-refresh',
                    undefined,
                    { raw: f.raw },
                );
            }
            expect(f.transaction).toHaveBeenCalledTimes(1);
            expect(f.run.mock.calls[0][0].key).toEqual({
                kind: 'user',
                uuid: 'credential',
                purpose: UserWarehouseCredentialPurpose.AI,
            });
            expect(f.deps.featureFlagModel.get.mock.calls).toEqual(
                Array.from({ length: 2 }, () => [
                    {
                        user: { organizationUuid: 'org' },
                        featureFlagId: FeatureFlags.WarehouseOAuthRefreshLock,
                    },
                ]),
            );
        },
    );

    test.each(['organization', 'clientVersion'] as const)(
        'does not share refresh results across a different %s binding',
        async (binding) => {
            const f = setup();
            const exchanged = deferred<refreshModule.SnowflakeRefreshResult>();
            f.exchange.mockReturnValueOnce(exchanged.promise);
            const first = f.provider.mint(args);
            await vi.waitFor(() => expect(f.exchange).toHaveBeenCalledTimes(1));
            const client = {
                ...snowflakeAgentClientMock,
                ...(binding === 'organization'
                    ? { organizationUuid: 'other-org' }
                    : { clientVersion: 'other-version' }),
            };
            const current = {
                ...credential,
                aiClientBinding: {
                    organizationUuid: client.organizationUuid,
                    clientVersion: client.clientVersion,
                },
            };
            const follower = new AgentSignInResolverHarness({
                ...f.deps,
                snowflakeAgentClientResolver: {
                    resolve: vi.fn().mockResolvedValue(client),
                },
                userWarehouseCredentialsModel: {
                    ...f.model,
                    findAiCredentialWithSecrets: vi
                        .fn()
                        .mockResolvedValue(current),
                } as unknown as UserWarehouseCredentialsModel,
            });
            f.exchange.mockResolvedValueOnce({
                ...tokens,
                accessToken: 'other-access',
            });
            const second = follower.mint({
                ...args,
                person: {
                    ...args.person,
                    organizationUuid: client.organizationUuid,
                },
            });
            await expect(second).resolves.toMatchObject({
                credentials: { token: 'other-access' },
            });
            exchanged.resolve(tokens);
            await expect(first).resolves.toMatchObject({
                credentials: { token: 'fresh-access' },
            });
            expect(f.exchange).toHaveBeenCalledTimes(2);
            expect(f.run.mock.calls[0][0].shareKey).not.toBe(
                f.run.mock.calls[1][0].shareKey,
            );
            expect(f.run.mock.calls[0][0].key).toEqual(
                f.run.mock.calls[1][0].key,
            );
        },
    );

    test('maps a shared exchange failure using each caller’s evaluation context', async () => {
        const f = setup();
        const exchanged = deferred<refreshModule.SnowflakeRefreshResult>();
        f.exchange.mockReturnValue(exchanged.promise);
        const warn = vi.spyOn(Logger, 'warn');
        const debug = vi.spyOn(Logger, 'debug');
        const first = f.provider.mint(args);
        await vi.waitFor(() => expect(f.exchange).toHaveBeenCalledTimes(1));
        const second = f.provider.mint({
            ...args,
            evaluationKind: 'diagnostic',
            organizationUuid: 'diagnostic-org',
        });
        const results = Promise.allSettled([first, second]);
        await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(2));
        exchanged.reject(new Error('network failure'));
        expect((await results).map((result) => result.status)).toEqual([
            'rejected',
            'rejected',
        ]);
        expect(warn).toHaveBeenCalledWith(
            'Agent sign-in refresh failed',
            expect.objectContaining({
                organizationUuid: 'log-org',
                kind: 'temporary',
            }),
        );
        expect(debug).toHaveBeenCalledWith(
            'Agent sign-in refresh failed',
            expect.objectContaining({
                organizationUuid: 'diagnostic-org',
                kind: 'temporary',
            }),
        );
        expect(f.exchange).toHaveBeenCalledTimes(1);
    });

    test('rereads the current credential after acquiring the lock', async () => {
        const f = setup();
        const acquired = deferred<void>();
        f.raw
            .mockResolvedValueOnce(undefined)
            .mockReturnValueOnce(acquired.promise);
        const pending = f.provider.mint(args);
        await vi.waitFor(() => expect(f.raw).toHaveBeenCalledTimes(2));
        expect(f.model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(1);
        f.model.findAiCredentialWithSecrets.mockResolvedValue({
            ...credential,
            credentials: {
                ...credential.credentials,
                type: WarehouseTypes.SNOWFLAKE,
                refreshToken: 'rotated-refresh',
            },
        });
        acquired.resolve();
        await pending;
        expect(f.exchange).toHaveBeenCalledExactlyOnceWith({
            client: snowflakeAgentClientMock,
            refreshToken: 'rotated-refresh',
            now: expect.any(Date),
            requestTimeoutMs: OAUTH_REQUEST_TIMEOUT_MS,
        });
        expect(f.model.rotateRefreshToken).toHaveBeenCalledExactlyOnceWith(
            'credential',
            'rotated-refresh',
            'new-refresh',
            { kind: 'unreported' },
            { raw: f.raw },
        );
    });

    test.each([
        {
            failure: { statusCode: 400, data: '{"error":"invalid_grant"}' },
            reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
        },
        {
            failure: { statusCode: 400, data: '{"error":"invalid_client"}' },
            reason: AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
        },
    ])(
        'preserves refusal mapping for $reason without retrying',
        async ({ failure, reason }) => {
            const f = setup();
            f.exchange.mockRejectedValue(failure);
            const error = await f.provider
                .mint(args)
                .catch((caught: unknown) => caught);
            expect(error).toMatchObject({
                refusal: { reason },
                cause: failure,
            });
            if (reason === AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED)
                expect(error).toMatchObject({
                    message:
                        'The warehouse OAuth client was rejected. Ask an administrator to check the agent sign-in settings.',
                });
            expect(f.exchange).toHaveBeenCalledTimes(1);
            expect(f.model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(
                2,
            );
            expect(f.model.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test.each(['query', 'diagnostic'] as const)(
        'preserves temporary errors and %s logging',
        async (evaluationKind) => {
            const f = setup();
            const failure = { statusCode: 503, data: 'unavailable' };
            f.exchange.mockRejectedValue(failure);
            const warn = vi.spyOn(Logger, 'warn');
            const debug = vi.spyOn(Logger, 'debug');
            const error = await f.provider
                .mint({ ...args, evaluationKind })
                .catch((caught: unknown) => caught);
            expect(error).toBeInstanceOf(UnexpectedServerError);
            expect(error).toMatchObject({
                message:
                    'The warehouse sign-in could not be refreshed. Try again in a moment.',
                data: {
                    code: 'warehouse_oauth_refresh_failed',
                    retryable: true,
                },
                cause: failure,
            });
            expect(
                evaluationKind === 'query' ? warn : debug,
            ).toHaveBeenCalledWith(
                'Agent sign-in refresh failed',
                expect.objectContaining({
                    kind: 'temporary',
                    organizationUuid: 'log-org',
                    userUuid: 'person',
                }),
            );
            expect(
                evaluationKind === 'query' ? debug : warn,
            ).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'maps a lock timeout to a retryable error with silent refresh %s',
        async (silentRefresh) => {
            const f = setup();
            f.raw.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
                Object.assign(new DatabaseError('timeout', 0, 'error'), {
                    code: '55P03',
                }),
            );
            const error = await f.provider
                .mint({ ...args, silentRefresh })
                .catch((caught: unknown) => caught);
            expect(error).toBeInstanceOf(UnexpectedServerError);
            expect(error).toMatchObject({
                data: {
                    code: 'warehouse_oauth_refresh_failed',
                    retryable: true,
                },
            });
            expect(f.exchange).not.toHaveBeenCalled();
        },
    );

    test.each([
        {
            name: 'deleted',
            current: undefined,
            reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
        },
        {
            name: 'replaced',
            current: { ...credential, uuid: 'replacement' },
            reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
        },
        {
            name: 'rebound',
            current: {
                ...credential,
                aiClientBinding: {
                    organizationUuid: 'org',
                    clientVersion: 'replacement',
                },
            },
            reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
        },
    ])(
        'refuses a $name credential under the lock',
        async ({ current, reason }) => {
            const f = setup();
            f.model.findAiCredentialWithSecrets
                .mockResolvedValueOnce(credential)
                .mockResolvedValue(current);
            await expect(f.provider.mint(args)).rejects.toMatchObject({
                refusal: { reason },
            });
            expect(f.exchange).not.toHaveBeenCalled();
            expect(f.model.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test.each([
        {
            name: 'new reported expiry',
            stored: null,
            reported: new Date('2099-02-01'),
            writes: true,
        },
        {
            name: 'unreported expiry with expired stored deadline',
            stored: new Date('2000-01-01'),
            reported: null,
            writes: true,
        },
        {
            name: 'unreported expiry with a live deadline',
            stored: new Date('2099-01-01'),
            reported: null,
            writes: false,
        },
        {
            name: 'unchanged reported expiry',
            stored: new Date('2099-01-01'),
            reported: new Date('2099-01-01'),
            writes: false,
        },
    ])(
        'preserves the unchanged-token write rule for $name',
        async ({ stored, reported, writes }) => {
            const f = setup();
            f.model.findAiCredentialWithSecrets.mockResolvedValue({
                ...credential,
                expiresAt: stored,
            });
            f.exchange.mockResolvedValue({
                ...tokens,
                refreshToken: 'old-refresh',
                refreshTokenExpiresAt: reported,
            });
            await f.provider.mint(args);
            if (writes)
                expect(
                    f.model.rotateRefreshToken,
                ).toHaveBeenCalledExactlyOnceWith(
                    'credential',
                    'old-refresh',
                    'old-refresh',
                    reported
                        ? { kind: 'reported', expiresAt: reported }
                        : { kind: 'unreported' },
                    { raw: f.raw },
                );
            else expect(f.model.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'propagates guarded write failures with silent refresh %s',
        async (silentRefresh) => {
            const f = setup();
            const failure = new Error('CAS failed');
            f.model.rotateRefreshToken.mockRejectedValue(failure);
            await expect(
                f.provider.mint({ ...args, silentRefresh }),
            ).rejects.toBe(failure);
        },
    );

    test('retains the silent-off invalid_grant mapping', async () => {
        const f = setup();
        const failure = { message: 'invalid_grant' };
        f.exchange.mockRejectedValue(failure);
        await expect(
            f.provider.mint({ ...args, silentRefresh: false }),
        ).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.SIGN_IN_EXPIRED },
            cause: failure,
        });
    });

    test('does not write an unchanged token with silent refresh off', async () => {
        const f = setup();
        f.exchange.mockResolvedValue({
            ...tokens,
            refreshToken: 'old-refresh',
            refreshTokenExpiresAt: new Date('2099-02-01'),
        });
        await f.provider.mint({ ...args, silentRefresh: false });
        expect(f.model.rotateRefreshToken).not.toHaveBeenCalled();
    });

    test.each([true, false])(
        'bypasses the coordinator when disabled with silent refresh %s',
        async (silentRefresh) => {
            const f = setup(false);
            await f.provider.mint({ ...args, silentRefresh });
            expect(f.run).not.toHaveBeenCalled();
            expect(f.model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(
                1,
            );
            expect(f.exchange).toHaveBeenCalledTimes(1);
        },
    );
});
