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
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
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
    connection,
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
        rotateRefreshToken: vi.fn(async () => {}),
    };
    const provider = new SnowflakeAiCredentialProvider({
        lightdashConfig: config,
        userWarehouseCredentialsModel:
            model as unknown as UserWarehouseCredentialsModel,
    });
    return { provider, model, config };
};

describe('SnowflakeAiCredentialProvider', () => {
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
