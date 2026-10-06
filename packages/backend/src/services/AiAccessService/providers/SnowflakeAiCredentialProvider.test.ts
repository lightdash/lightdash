import {
    AiAccessRefusalReason,
    AiCredentialMethod,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiSetupScriptFormat,
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
import { policy, principal } from './PostgresAiCredentialProvider.mock';
import { SnowflakeAiCredentialProvider } from './SnowflakeAiCredentialProvider';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    checkSnowflakeAgentSessionWithToken: vi.fn(),
}));

const connection: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
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
    credentials: {
        type: WarehouseTypes.SNOWFLAKE,
        user: 'person-user',
        authenticationType: SnowflakeAuthenticationType.SSO,
        refreshToken: 'old-refresh-token',
    },
};
const mintArgs = {
    connection,
    principal: { ...principal, kind: AiPrincipalKind.PERSON, userUuid: 'user' },
    policy: { ...policy, principalKind: AiPrincipalKind.PERSON },
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

    test('exposes only person sign-in and direct transport', async () => {
        const { provider } = setup();
        expect(provider.capabilities()).toMatchObject({
            principals: {
                person: { available: true, method: AiCredentialMethod.SIGN_IN },
                twin: { available: false },
                group: { available: false },
                shared: { available: false },
            },
            transports: {
                direct: { available: true },
                procedure: { available: false },
            },
            setupFormat: AiSetupScriptFormat.SQL,
        });
        expect(await provider.createSecret()).toBeNull();
    });
    test.each([
        'clientId',
        'clientSecret',
        'authorizationEndpoint',
        'tokenEndpoint',
    ] as const)('requires OAuth %s', (field) => {
        const { provider, config } = setup();
        config.auth.snowflakeAi[field] = '';
        expect(provider.capabilities().principals.person).toEqual({
            available: false,
            reason: 'The Snowflake sign-in for AI is not configured on this instance. Set the SNOWFLAKE_AI_OAUTH_* settings.',
        });
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
    test('refuses missing sign-in', async () => {
        const { provider, model } = setup();
        model.findAiCredentialWithSecrets.mockResolvedValue(undefined);
        await expect(provider.mint(mintArgs)).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.NEEDS_SIGN_IN },
        });
        expect(UserService.generateSnowflakeAccessToken).not.toHaveBeenCalled();
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
                expiresAt: null,
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
    test.each([
        AiPrincipalKind.TWIN,
        AiPrincipalKind.GROUP,
        AiPrincipalKind.SHARED,
    ])('refuses principal %s', async (kind) => {
        const { provider, model } = setup();
        await expect(
            provider.mint({ ...mintArgs, principal: { ...principal, kind } }),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
        expect(model.findAiCredentialWithSecrets).not.toHaveBeenCalled();
    });
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
        ).toHaveBeenCalledExactlyOnceWith('account', 'access-token');
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
                reason: AiPrincipalFailureReason.NOT_AGENT_SESSION,
                message: SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
            });
            expect(JSON.stringify(result)).not.toContain('access-token');
        },
    );
    test.each([null, '', ' '])(
        'requires a restricted scope when requested: %s',
        async (scope) => {
            const { provider } = setup();
            vi.mocked(checkSnowflakeAgentSessionWithToken).mockResolvedValue({
                agentActivated: true,
                currentRole: 'role',
                activeRestrictedSessionScopes: scope,
            });
            const result = await provider.probe(connection, [
                { kind: 'restricted_session_scope_active' },
            ]);
            expect(result).toMatchObject({
                ok: false,
                reason: AiPrincipalFailureReason.NO_RESTRICTED_SESSION_SCOPE,
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
            reason: AiPrincipalFailureReason.CREDENTIAL_REJECTED,
        });
        expect(checkSnowflakeAgentSessionWithToken).not.toHaveBeenCalled();
    });
    test('rejects unsupported assurances', async () => {
        const { provider } = setup();
        await expect(
            provider.probe(connection, [
                { kind: 'current_user_is', expected: 'user' },
            ]),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
        expect(checkSnowflakeAgentSessionWithToken).not.toHaveBeenCalled();
    });
    test('generates agent integration and control setup SQL', () => {
        const { provider } = setup();
        const script = provider.setupScript(mintArgs);
        expect(script.format).toBe(AiSetupScriptFormat.SQL);
        expect(script.parts[0].body).toContain('IS_AGENTIC = TRUE');
        expect(script.parts[0].body).toContain(
            'https://lightdash.example.test/api/v1/login/snowflake-ai/callback',
        );
        expect(script.parts[1].body).toContain(
            'AGENT_RESTRICTED_SESSION_SCOPE',
        );
        expect(script.parts[1].body).toContain(
            "SYS_CONTEXT('SNOWFLAKE$CURRENT','IS_AGENT_ACTIVATED')",
        );
    });
});
