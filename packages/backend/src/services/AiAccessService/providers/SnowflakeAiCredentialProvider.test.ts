import {
    AiAccessRefusalReason,
    AiAgentMarkerLevel,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AiAssurance,
    type CreateSnowflakeCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import {
    checkSnowflakeAgentSessionWithToken,
    SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
} from '@lightdash/warehouses';
import refresh from 'passport-oauth2-refresh';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import { type UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { UserService } from '../../UserService';
import { AiSessionFailureReason } from './AiCredentialProvider';
import { SnowflakeAiCredentialProvider } from './SnowflakeAiCredentialProvider';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    checkSnowflakeAgentSessionWithToken: vi.fn(),
}));

const connection: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    accessUrl: 'https://private.example.test',
    user: 'connection-user',
    password: 'connection-password',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'public',
    token: 'access-token',
    requireUserCredentials: true,
};
const credential: UserWarehouseCredentialsWithSecrets = {
    uuid: 'credential',
    expiresAt: null,
    credentials: {
        type: WarehouseTypes.SNOWFLAKE,
        user: 'person-user',
        authenticationType: SnowflakeAuthenticationType.SSO,
        refreshToken: 'old-refresh-token',
    },
};
const mintArgs = {
    silentRefresh: false,
    connection,
    organizationUuid: 'org',
    evaluationKind: 'query' as const,
    person: { userUuid: 'user', email: 'user@example.test' },
};
const assurances: AiAssurance[] = [
    { kind: 'agent_session_active' },
    { kind: 'result_cache_off' },
];
const setup = () => {
    const config = {
        ...lightdashConfigMock,
        siteUrl: 'https://lightdash.example.test',
        auth: {
            ...lightdashConfigMock.auth,
            snowflakeAi: {
                clientId: 'client',
                clientSecret: 'secret',
                authorizationEndpoint:
                    'https://snowflake.example.test/authorize',
                tokenEndpoint: 'https://snowflake.example.test/token',
                account: 'account',
                loginPath: '/login/snowflake-ai',
                callbackPath: '/login/snowflake-ai/callback',
            },
        },
    };
    const model = {
        findAiCredentialWithSecrets: vi.fn(
            async (): Promise<
                UserWarehouseCredentialsWithSecrets | undefined
            > => credential,
        ),
        deleteAiCredential: vi.fn(),
        rotateRefreshToken: vi.fn(
            async (
                _uuid: string,
                _old: string,
                _next: string,
                _expiry?: Parameters<
                    UserWarehouseCredentialsModel['rotateRefreshToken']
                >[3],
            ) => true,
        ),
    };
    const provider = new SnowflakeAiCredentialProvider({
        lightdashConfig: config,
        userWarehouseCredentialsModel:
            model as unknown as UserWarehouseCredentialsModel,
    });
    return { provider, model, config };
};

describe('SnowflakeAiCredentialProvider', () => {
    test('disconnect blocks mint immediately after a successful mint without waiting eight minutes', async () => {
        const { provider, model } = setup();
        await provider.mint(mintArgs);
        model.findAiCredentialWithSecrets.mockResolvedValue(undefined);
        await expect(provider.mint(mintArgs)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.NEEDS_SIGN_IN },
        });
        expect(model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(2);
        expect(UserService.generateSnowflakeAccessToken).toHaveBeenCalledOnce();
    });

    test('a refresh failure after warm mint is seen on the next mint', async () => {
        const { provider, model } = setup();
        await provider.mint(mintArgs);
        vi.mocked(UserService.generateSnowflakeAccessToken).mockRejectedValue({
            data: 'invalid_grant',
        });
        await expect(provider.mint(mintArgs)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.SIGN_IN_EXPIRED },
        });
        expect(model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(2);
        expect(UserService.generateSnowflakeAccessToken).toHaveBeenCalledTimes(
            2,
        );
    });

    test('access token rejection is probed again and never reuses the prior successful probe', async () => {
        const { provider } = setup();
        const first = await provider.mint(mintArgs);
        expect(
            (await provider.probe(first.credentials, first.assurances)).ok,
        ).toBe(true);
        vi.mocked(checkSnowflakeAgentSessionWithToken).mockRejectedValue(
            new Error('invalid access token'),
        );
        const second = await provider.mint(mintArgs);
        await expect(
            provider.probe(second.credentials, second.assurances),
        ).resolves.toMatchObject({
            ok: false,
            reason: AiSessionFailureReason.CREDENTIAL_REJECTED,
            transient: false,
        });
        expect(checkSnowflakeAgentSessionWithToken).toHaveBeenCalledTimes(2);
    });

    test.each([
        [
            'connection refused at private.example.test',
            AiSessionFailureReason.UNKNOWN,
            true,
        ],
        [
            'invalid access token at private.example.test',
            AiSessionFailureReason.CREDENTIAL_REJECTED,
            false,
        ],
        ['user disabled', AiSessionFailureReason.DISABLED_OR_LOCKED, false],
        [
            'blocked by network policy',
            AiSessionFailureReason.NETWORK_POLICY,
            false,
        ],
        [
            'warehouse permission denied',
            AiSessionFailureReason.WAREHOUSE_ACCESS,
            false,
        ],
    ])(
        'classifies connection failure %s without exposing the host',
        async (message, reason, transient) => {
            const { provider } = setup();
            vi.mocked(checkSnowflakeAgentSessionWithToken).mockRejectedValue(
                new Error(message),
            );
            const result = await provider.probe(connection, assurances);
            expect(result).toMatchObject({ ok: false, reason, transient });
            expect(JSON.stringify(result)).not.toContain(
                'private.example.test',
            );
        },
    );
    test('expires minted tokens after eight minutes', async () => {
        const { provider } = setup();
        const before = Date.now();
        const result = await provider.mint(mintArgs);
        expect(result.expiresAt?.getTime()).toBeGreaterThanOrEqual(
            before + 480000,
        );
        expect(result.expiresAt?.getTime()).toBeLessThanOrEqual(
            Date.now() + 480000,
        );
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.mocked(checkSnowflakeAgentSessionWithToken).mockReset();
        vi.mocked(checkSnowflakeAgentSessionWithToken).mockResolvedValue({
            agentActivated: true,
            currentRole: 'role',
            activeRestrictedSessionScopes: 'scope',
        });
        vi.spyOn(UserService, 'generateSnowflakeAccessToken').mockResolvedValue(
            {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token',
            },
        );
    });

    test('accepts a configured agent sign-in', () => {
        expect(setup().provider.configurationError()).toBeNull();
    });
    test('requires an account when the token endpoint does not name one', () => {
        const { provider, config } = setup();
        config.auth.snowflakeAi.account = '';
        expect(provider.configurationError()).toBe(
            'The Snowflake agent connection is not configured on this instance. Set the SNOWFLAKE_AI_OAUTH_* settings.',
        );
    });
    test.each([
        'clientId',
        'clientSecret',
        'authorizationEndpoint',
        'tokenEndpoint',
    ] as const)('requires OAuth %s', (field) => {
        const { provider, config } = setup();
        config.auth.snowflakeAi[field] = '';
        expect(provider.configurationError()).toBe(
            'The Snowflake agent connection is not configured on this instance. Set the SNOWFLAKE_AI_OAUTH_* settings.',
        );
    });
    test.each([true, false])(
        'checks sign-in without side effects: %s',
        async (exists) => {
            const { provider, model } = setup();
            model.findAiCredentialWithSecrets.mockResolvedValue(
                exists ? credential : undefined,
            );
            expect(await provider.missingPrerequisite(mintArgs)).toBe(
                exists ? null : AiAccessRefusalReason.NEEDS_SIGN_IN,
            );
            expect(
                model.findAiCredentialWithSecrets,
            ).toHaveBeenCalledExactlyOnceWith({
                userUuid: 'user',
                warehouseType: WarehouseTypes.SNOWFLAKE,
            });
            expect(
                UserService.generateSnowflakeAccessToken,
            ).not.toHaveBeenCalled();
            expect(model.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );
    test('refuses an expired credential without refreshing it', async () => {
        const { provider, model } = setup();
        model.findAiCredentialWithSecrets.mockResolvedValue({
            ...credential,
            expiresAt: new Date(Date.now() - 1),
        });
        expect(await provider.missingPrerequisite(mintArgs)).toBe(
            AiAccessRefusalReason.SIGN_IN_EXPIRED,
        );
        await expect(provider.mint(mintArgs)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.SIGN_IN_EXPIRED },
        });
        expect(UserService.generateSnowflakeAccessToken).not.toHaveBeenCalled();
        expect(model.rotateRefreshToken).not.toHaveBeenCalled();
    });
    test('accepts a future credential expiry', async () => {
        const { provider, model } = setup();
        model.findAiCredentialWithSecrets.mockResolvedValue({
            ...credential,
            expiresAt: new Date(Date.now() + 86400000),
        });
        expect(await provider.missingPrerequisite(mintArgs)).toBeNull();
        await expect(provider.mint(mintArgs)).resolves.toMatchObject({
            identityUuid: credential.uuid,
        });
    });
    test('refuses missing sign-in', async () => {
        const { provider, model } = setup();
        model.findAiCredentialWithSecrets.mockResolvedValue(undefined);
        await expect(provider.mint(mintArgs)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.NEEDS_SIGN_IN },
        });
        expect(UserService.generateSnowflakeAccessToken).not.toHaveBeenCalled();
    });
    test.each([
        [new Error('invalid_grant'), AiAccessRefusalReason.SIGN_IN_EXPIRED],
        [
            {
                data: '{"error":"invalid_grant"}',
                message: 'Failed to obtain access token',
            },
            AiAccessRefusalReason.SIGN_IN_EXPIRED,
        ],
        [
            { data: '{"error":"invalid_client"}' },
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        ],
        [new Error('network failure'), AiAccessRefusalReason.NEEDS_SIGN_IN],
        [null, AiAccessRefusalReason.NEEDS_SIGN_IN],
        [
            { statusCode: 503, data: '{"error":"server_error"}' },
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        ],
        [{ statusCode: 429, data: '' }, AiAccessRefusalReason.NEEDS_SIGN_IN],
        [
            { statusCode: 503, data: '{"error":"invalid_grant"}' },
            AiAccessRefusalReason.SIGN_IN_EXPIRED,
        ],
    ])('classifies a refresh failure %s', async (error, reason) => {
        const { provider, model } = setup();
        vi.mocked(UserService.generateSnowflakeAccessToken).mockRejectedValue(
            error,
        );
        await expect(provider.mint(mintArgs)).rejects.toMatchObject({
            refusal: { reason },
        });
        expect(model.rotateRefreshToken).not.toHaveBeenCalled();
        expect(checkSnowflakeAgentSessionWithToken).not.toHaveBeenCalled();
    });
    test.each(['old-refresh-token', 'new-refresh-token'])(
        'refreshes with AI purpose and rotates only changed tokens: %s',
        async (refreshToken) => {
            const { provider, model } = setup();
            vi.mocked(
                UserService.generateSnowflakeAccessToken,
            ).mockResolvedValue({
                accessToken: 'new-access-token',
                refreshToken,
            });
            expect(await provider.mint(mintArgs)).toMatchObject({
                credentials: {
                    account: connection.account,
                    user: 'person-user',
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    token: 'new-access-token',
                    refreshToken,
                    requireAgentSession: true,
                    requireUserCredentials: false,
                },
                assurances,
                expiresAt: expect.any(Date),
            });
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'old-refresh-token',
                UserWarehouseCredentialPurpose.AI,
            );
            if (refreshToken === 'old-refresh-token')
                expect(model.rotateRefreshToken).not.toHaveBeenCalled();
            else
                expect(
                    model.rotateRefreshToken,
                ).toHaveBeenCalledExactlyOnceWith(
                    'credential',
                    'old-refresh-token',
                    refreshToken,
                );
        },
    );
    test('proves the agent session and reports observations', async () => {
        const { provider } = setup();
        expect(await provider.probe(connection, assurances)).toEqual({
            ok: true,
            checkedAt: expect.any(Date),
            observed: {
                current_role: 'role',
                active_restricted_session_scopes: 'scope',
            },
        });
        expect(
            checkSnowflakeAgentSessionWithToken,
        ).toHaveBeenCalledExactlyOnceWith('account', 'access-token', {
            throwOnError: true,
            accessUrl: connection.accessUrl,
        });
    });
    test.each(assurances)(
        'refuses an inactive session for %s',
        async (assurance) => {
            const { provider } = setup();
            vi.mocked(checkSnowflakeAgentSessionWithToken).mockResolvedValue({
                agentActivated: false,
                currentRole: null,
                activeRestrictedSessionScopes: null,
            });
            const result = await provider.probe(connection, [assurance]);
            expect(result).toMatchObject({
                ok: false,
                reason: AiSessionFailureReason.NOT_AGENT_SESSION,
                transient: false,
                message: SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
            });
            expect(JSON.stringify(result)).not.toContain('access-token');
        },
    );
    test('rejects a missing token without a connection', async () => {
        const { provider } = setup();
        expect(
            await provider.probe({ ...connection, token: '' }, assurances),
        ).toMatchObject({
            ok: false,
            reason: AiSessionFailureReason.CREDENTIAL_REJECTED,
            transient: false,
        });
        expect(checkSnowflakeAgentSessionWithToken).not.toHaveBeenCalled();
    });
    test('rejects unsupported assurances', async () => {
        const { provider } = setup();
        await expect(
            provider.probe(connection, [
                {
                    kind: 'agent_marker',
                    level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                },
            ]),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
        expect(checkSnowflakeAgentSessionWithToken).not.toHaveBeenCalled();
    });
});

describe('silent Snowflake refresh', () => {
    const args = { ...mintArgs, silentRefresh: true };
    const now = new Date('2026-10-09T12:00:00Z');
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        vi.spyOn(UserService, 'generateSnowflakeAccessToken').mockResolvedValue(
            { accessToken: 'access', refreshToken: 'T2' },
        );
        vi.spyOn(refresh, 'requestNewAccessToken').mockImplementation(
            (_strategy, _token, callback) => {
                callback(null, 'access', 'T2', {
                    expires_in: 600,
                    refresh_token_expires_in: 3600,
                });
            },
        );
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('refreshes a past deadline and persists the returned expiry', async () => {
        const { provider, model } = setup();
        model.findAiCredentialWithSecrets.mockResolvedValue({
            ...credential,
            expiresAt: new Date(0),
        });
        expect(await provider.missingPrerequisite(args)).toBeNull();
        expect(refresh.requestNewAccessToken).not.toHaveBeenCalled();
        await expect(provider.mint(args)).resolves.toMatchObject({
            expiresAt: new Date(now.getTime() + 600000),
        });
        expect(model.rotateRefreshToken).toHaveBeenCalledWith(
            'credential',
            'old-refresh-token',
            'T2',
            { kind: 'reported', expiresAt: new Date(now.getTime() + 3600000) },
        );
    });
    test.each([new Date(0), new Date('2030-01-01')])(
        'refuses a gone grant with stored deadline %s',
        async (expiresAt) => {
            const { provider, model } = setup();
            model.findAiCredentialWithSecrets.mockResolvedValue({
                ...credential,
                expiresAt,
            });
            vi.mocked(refresh.requestNewAccessToken).mockImplementation(
                (_strategy, _token, callback) =>
                    callback(
                        { statusCode: 400, data: '{"error":"invalid_grant"}' },
                        '',
                        '',
                        {},
                    ),
            );
            const result = provider.mint(args).catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(1000);
            expect(await result).toMatchObject({
                refusal: { reason: AiAccessRefusalReason.SIGN_IN_EXPIRED },
            });
            expect(model.rotateRefreshToken).not.toHaveBeenCalled();
            expect(model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(4);
            expect(refresh.requestNewAccessToken).toHaveBeenCalledTimes(1);
            expect(vi.getTimerCount()).toBe(0);
            expect(model.deleteAiCredential).not.toHaveBeenCalled();
        },
    );
    test.each([
        new Error('ECONNRESET'),
        { statusCode: 503, data: '{"error":"server_error"}' },
        { statusCode: 429, data: '' },
        { statusCode: 503, data: '{"error":"invalid_grant"}' },
    ])('keeps temporary failures retryable: %s', async (error) => {
        const { provider, model } = setup();
        vi.mocked(UserService.generateSnowflakeAccessToken).mockRejectedValue(
            error,
        );
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, _token, callback) => callback(error, '', '', {}),
        );
        await expect(provider.mint(args)).rejects.toMatchObject({
            name: 'UnexpectedServerError',
            data: { code: 'warehouse_oauth_refresh_failed', retryable: true },
        });
        expect(model.rotateRefreshToken).not.toHaveBeenCalled();
        expect(model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(1);
        expect(model.deleteAiCredential).not.toHaveBeenCalled();
    });
    test.each([new Date(0), new Date('2030-01-01'), null])(
        'preserves or clears expiry when metadata is absent: %s',
        async (expiresAt) => {
            const { provider, model } = setup();
            model.findAiCredentialWithSecrets.mockResolvedValue({
                ...credential,
                expiresAt,
            });
            vi.mocked(refresh.requestNewAccessToken).mockImplementation(
                (_strategy, _token, callback) =>
                    callback(null, 'access', 'T2', {}),
            );
            await expect(provider.mint(args)).resolves.toMatchObject({
                expiresAt: new Date(now.getTime() + 480000),
            });
            expect(model.rotateRefreshToken).toHaveBeenCalledWith(
                'credential',
                'old-refresh-token',
                'T2',
                { kind: 'unreported' },
            );
        },
    );
    test('clears a deadline that passes during a successful exchange', async () => {
        const { provider, model } = setup();
        model.findAiCredentialWithSecrets.mockResolvedValue({
            ...credential,
            expiresAt: new Date(now.getTime() + 1000),
        });
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, _token, callback) => {
                vi.setSystemTime(now.getTime() + 2000);
                callback(null, 'access', 'old-refresh-token', {});
            },
        );
        await provider.mint(args);
        expect(model.rotateRefreshToken).toHaveBeenCalledWith(
            'credential',
            'old-refresh-token',
            'old-refresh-token',
            { kind: 'unreported' },
        );
    });
    test('updates expiry even when the refresh token is unchanged', async () => {
        const { provider, model } = setup();
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, _token, callback) =>
                callback(null, 'access', 'old-refresh-token', {
                    refresh_token_expires_in: 3600,
                }),
        );
        await provider.mint(args);
        expect(model.rotateRefreshToken).toHaveBeenCalledWith(
            'credential',
            'old-refresh-token',
            'old-refresh-token',
            { kind: 'reported', expiresAt: new Date(now.getTime() + 3600000) },
        );
    });
    test('does not retry a second invalid grant', async () => {
        const { provider, model } = setup();
        model.findAiCredentialWithSecrets
            .mockResolvedValueOnce(credential)
            .mockResolvedValue({
                ...credential,
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    user: 'user',
                    refreshToken: 'newer',
                },
            });
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, _token, callback) =>
                callback(
                    { statusCode: 400, data: '{"error":"invalid_grant"}' },
                    '',
                    '',
                    {},
                ),
        );
        await expect(provider.mint(args)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.SIGN_IN_EXPIRED },
        });
        expect(refresh.requestNewAccessToken).toHaveBeenCalledTimes(2);
        expect(model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(2);
        expect(model.rotateRefreshToken).not.toHaveBeenCalled();
        expect(model.deleteAiCredential).not.toHaveBeenCalled();
    });
    test.each([
        '{"error":"invalid_client","error_description":"invalid_grant"}',
        '{"error":"unauthorized_client"}',
        '{"error":"invalid_request"}',
        'unparseable response',
    ])('directs configuration errors to an administrator: %s', async (data) => {
        const { provider, model } = setup();
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, _token, callback) =>
                callback({ statusCode: 400, data }, '', '', {}),
        );
        await expect(provider.mint(args)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                action: null,
                connectUrl: null,
                message:
                    'The warehouse OAuth client was rejected. Ask an administrator to check the agent sign-in settings.',
            },
        });
        expect(model.rotateRefreshToken).not.toHaveBeenCalled();
        expect(model.deleteAiCredential).not.toHaveBeenCalled();
    });
    test('skips the write when neither the token nor expiry changes', async () => {
        const { provider, model } = setup();
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, _token, callback) => callback(null, 'access', '', {}),
        );
        await provider.mint(args);
        expect(model.rotateRefreshToken).not.toHaveBeenCalled();
    });
    test('waits for a concurrent rotation to commit after invalid_grant', async () => {
        const { provider, model } = setup();
        let currentToken = 'old-refresh-token';
        model.findAiCredentialWithSecrets.mockImplementation(async () => ({
            ...credential,
            credentials: {
                ...credential.credentials,
                refreshToken: currentToken,
            },
        }));
        model.rotateRefreshToken.mockImplementation(
            async (_uuid, expected, next) => {
                if (next === 'T2')
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 450);
                    });
                if (currentToken !== expected) return false;
                currentToken = next;
                return true;
            },
        );
        let calls = 0;
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, token, callback) => {
                calls += 1;
                if (calls === 1) callback(null, 'A1', 'T2', {});
                else if (token === 'old-refresh-token') {
                    expect(currentToken).toBe('old-refresh-token');
                    callback(
                        { statusCode: 400, data: '{"error":"invalid_grant"}' },
                        '',
                        '',
                        {},
                    );
                } else callback(null, 'A2', 'T3', {});
            },
        );
        const results = Promise.allSettled([
            provider.mint(args),
            provider.mint(args),
        ]);
        await vi.advanceTimersByTimeAsync(300);
        expect(currentToken).toBe('old-refresh-token');
        await vi.advanceTimersByTimeAsync(700);
        expect(await results).toEqual([
            expect.objectContaining({ status: 'fulfilled' }),
            expect.objectContaining({ status: 'fulfilled' }),
        ]);
        expect(refresh.requestNewAccessToken).toHaveBeenCalledTimes(3);
        expect(model.findAiCredentialWithSecrets).toHaveBeenCalledTimes(5);
        expect(currentToken).toBe('T3');
    });
    test('retries once after a concurrent single-use token rotation', async () => {
        const { provider, model } = setup();
        let currentToken = 'old-refresh-token';
        model.findAiCredentialWithSecrets.mockImplementation(async () => ({
            ...credential,
            credentials: {
                ...credential.credentials,
                refreshToken: currentToken,
            },
        }));
        let rotated: () => void = () => {};
        const rotation = new Promise<void>((resolve) => {
            rotated = resolve;
        });
        model.rotateRefreshToken.mockImplementation(
            async (_uuid, expected, next) => {
                const swapped = currentToken === expected;
                if (swapped) currentToken = next;
                rotated();
                return swapped;
            },
        );
        let calls = 0;
        vi.mocked(refresh.requestNewAccessToken).mockImplementation(
            (_strategy, token, callback) => {
                calls += 1;
                if (calls === 1) callback(null, 'A1', 'T2', {});
                else if (token === 'old-refresh-token')
                    void rotation.then(() =>
                        callback(
                            {
                                statusCode: 400,
                                data: '{"error":"invalid_grant"}',
                            },
                            '',
                            '',
                            {},
                        ),
                    );
                else callback(null, 'A2', 'T3', {});
            },
        );
        await expect(
            Promise.all([provider.mint(args), provider.mint(args)]),
        ).resolves.toHaveLength(2);
        expect(refresh.requestNewAccessToken).toHaveBeenCalledTimes(3);
        expect(currentToken).toBe('T3');
    });
});

describe('agent refresh logs', () => {
    afterEach(() => vi.restoreAllMocks());
    test.each([
        { newToken: false, rotated: false },
        { newToken: true, rotated: true },
        { newToken: true, rotated: false },
    ])(
        'logs refresh and rotation outcome $newToken/$rotated without tokens',
        async ({ newToken, rotated }) => {
            const { provider, model } = setup();
            model.rotateRefreshToken.mockResolvedValue(rotated);
            const debug = vi
                .spyOn(Logger, 'debug')
                .mockImplementation(() => Logger);
            const info = vi
                .spyOn(Logger, 'info')
                .mockImplementation(() => Logger);
            const warn = vi
                .spyOn(Logger, 'warn')
                .mockImplementation(() => Logger);
            vi.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'new-access-token',
                refreshToken: newToken
                    ? 'new-refresh-token'
                    : 'old-refresh-token',
            });
            await provider.mint(mintArgs);
            expect(info.mock.calls).toEqual([
                [
                    'Agent sign-in refreshed',
                    { userUuid: 'user', organizationUuid: 'org' },
                ],
                ...(rotated
                    ? [
                          [
                              'Agent sign-in refresh token rotated',
                              { userUuid: 'user', organizationUuid: 'org' },
                          ],
                      ]
                    : []),
            ]);
            expect(debug.mock.calls).toEqual(
                newToken && !rotated
                    ? [
                          [
                              'Agent sign-in refresh token rotation skipped',
                              { userUuid: 'user', organizationUuid: 'org' },
                          ],
                      ]
                    : [],
            );
            expect(
                JSON.stringify([
                    info.mock.calls,
                    warn.mock.calls,
                    debug.mock.calls,
                ]),
            ).not.toMatch(
                /new-access-token|new-refresh-token|old-refresh-token|user@example.test|connection-password|SELECT/,
            );
        },
    );

    test.each(['query', 'diagnostic'] as const)(
        'logs a redacted %s refresh failure and preserves its cause',
        async (evaluationKind) => {
            const { provider, model } = setup();
            const warn = vi
                .spyOn(Logger, 'warn')
                .mockImplementation(() => Logger);
            const debug = vi
                .spyOn(Logger, 'debug')
                .mockImplementation(() => Logger);
            const info = vi
                .spyOn(Logger, 'info')
                .mockImplementation(() => Logger);
            const error = new Error(
                'invalid_grant refresh_token=old-refresh-token user@example.test SELECT secret_column FROM private_table',
            );
            vi.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockRejectedValue(error);
            await expect(
                provider.mint({ ...mintArgs, evaluationKind }),
            ).rejects.toMatchObject({
                cause: error,
            });
            expect(
                evaluationKind === 'diagnostic' ? debug : warn,
            ).toHaveBeenCalledExactlyOnceWith('Agent sign-in refresh failed', {
                userUuid: 'user',
                organizationUuid: 'org',
                reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
                errorClass: 'Error',
                errorCode: null,
                errorCategory: 'invalid_grant',
                errorMessage: '[REDACTED]',
            });
            expect(
                evaluationKind === 'diagnostic' ? warn : debug,
            ).not.toHaveBeenCalled();
            expect(info).not.toHaveBeenCalled();
            expect(model.rotateRefreshToken).not.toHaveBeenCalled();
            expect(
                JSON.stringify([
                    warn.mock.calls,
                    debug.mock.calls,
                    info.mock.calls,
                ]),
            ).not.toMatch(
                /old-refresh-token|user@example.test|secret_column|private_table/,
            );
        },
    );
});

describe('silent refresh logs', () => {
    const args = { ...mintArgs, silentRefresh: true };
    const spyLogs = () => ({
        info: vi.spyOn(Logger, 'info').mockImplementation(() => Logger),
        warn: vi.spyOn(Logger, 'warn').mockImplementation(() => Logger),
        debug: vi.spyOn(Logger, 'debug').mockImplementation(() => Logger),
    });
    const ids = { userUuid: 'user', organizationUuid: 'org' };
    const secrets =
        /old-refresh-token|new-refresh-token|new-access-token|user@example.test|client-secret|connection-password/;
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test.each([
        {
            rotated: true,
            level: 'info',
            message: 'Agent sign-in refresh token rotated',
        },
        {
            rotated: false,
            level: 'debug',
            message: 'Agent sign-in refresh token rotation skipped',
        },
    ] as const)(
        'logs refresh success and rotation outcome $rotated',
        async ({ rotated, level, message }) => {
            const { provider, model } = setup();
            model.rotateRefreshToken.mockResolvedValue(rotated);
            vi.spyOn(refresh, 'requestNewAccessToken').mockImplementation(
                (_strategy, _token, callback) => {
                    callback(null, 'new-access-token', 'new-refresh-token', {
                        expires_in: 600,
                    });
                },
            );
            const logs = spyLogs();
            await provider.mint(args);
            expect(logs.info).toHaveBeenCalledWith(
                'Agent sign-in refreshed',
                ids,
            );
            expect(logs[level]).toHaveBeenCalledWith(message, ids);
            expect(logs.warn).not.toHaveBeenCalled();
            expect(
                JSON.stringify([logs.info.mock.calls, logs.debug.mock.calls]),
            ).not.toMatch(secrets);
        },
    );

    test.each([
        {
            kind: 'grant_gone',
            failure: {
                statusCode: 400,
                data: '{"error":"invalid_grant","error_description":"old-refresh-token is gone"}',
            },
            reason: {
                refusal: { reason: AiAccessRefusalReason.SIGN_IN_EXPIRED },
            },
        },
        {
            kind: 'temporary',
            failure: new Error('ECONNRESET old-refresh-token'),
            reason: { data: { code: 'warehouse_oauth_refresh_failed' } },
        },
        {
            kind: 'configuration',
            failure: {
                statusCode: 401,
                data: '{"error":"invalid_client","error_description":"client-secret rejected"}',
            },
            reason: {
                refusal: {
                    reason: AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                },
            },
        },
    ] as const)(
        'logs a redacted $kind refresh failure once and keeps the cause',
        async ({ kind, failure, reason }) => {
            const { provider, model } = setup();
            vi.spyOn(refresh, 'requestNewAccessToken').mockImplementation(
                (_strategy, _token, callback) =>
                    callback(failure as never, '', '', {}),
            );
            const logs = spyLogs();
            const result = provider.mint(args).catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(1000);
            const error = await result;
            expect(error).toMatchObject(reason);
            expect((error as Error).cause).toBe(failure);
            expect(JSON.stringify(error)).not.toMatch(secrets);
            expect(logs.warn).toHaveBeenCalledExactlyOnceWith(
                'Agent sign-in refresh failed',
                expect.objectContaining({ ...ids, kind }),
            );
            expect(logs.info).not.toHaveBeenCalled();
            expect(model.rotateRefreshToken).not.toHaveBeenCalled();
            expect(
                JSON.stringify([logs.warn.mock.calls, logs.debug.mock.calls]),
            ).not.toMatch(secrets);
        },
    );

    test('logs a diagnostic refresh failure at debug', async () => {
        const { provider } = setup();
        vi.spyOn(refresh, 'requestNewAccessToken').mockImplementation(
            (_strategy, _token, callback) =>
                callback(new Error('ECONNRESET') as never, '', '', {}),
        );
        const logs = spyLogs();
        await expect(
            provider.mint({ ...args, evaluationKind: 'diagnostic' }),
        ).rejects.toBeDefined();
        expect(logs.debug).toHaveBeenCalledWith(
            'Agent sign-in refresh failed',
            expect.objectContaining({ ...ids, kind: 'temporary' }),
        );
        expect(logs.warn).not.toHaveBeenCalled();
    });
});
