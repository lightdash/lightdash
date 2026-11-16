import {
    MOBILE_SIGN_IN_CODE_TOKEN_TYPE,
    TOKEN_EXCHANGE_GRANT_TYPE,
    type SessionUser,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { MobileSignInOAuthError } from '../../MobileSignInService/MobileSignInOAuthError';
import type { MobileSignInService } from '../../MobileSignInService/MobileSignInService';
import type { ManagedSignInService } from './ManagedSignInService';
import {
    createMicrosoftTokenExchangeGrantType,
    MobileSignInGrantError,
    setTokenRequestClientIp,
} from './microsoftTokenExchangeGrantType';

const sessionUser = {
    userUuid: 'user-0000-test',
    organizationUuid: 'org-0000-test',
} as SessionUser;

const client = {
    id: 'client-0000-test',
    grants: [TOKEN_EXCHANGE_GRANT_TYPE],
} as unknown as OAuth2Server.Client;

const body = {
    grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
    subject_token: 'Q0RFLTAwMDAtdGVzdC0wMDAwLXRlc3QtMDAwMDAwMDA',
    subject_token_type: MOBILE_SIGN_IN_CODE_TOKEN_TYPE,
    code_verifier: 'dmVyaWZpZXItMDAwMC10ZXN0LTAwMDAtdGVzdC0wMDAwMDAwMA',
    match_number: '42',
    scope: 'read',
};

const createRequest = (requestBody: Record<string, unknown>) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-forwarded-for': '198.51.100.1',
        },
        query: {},
        body: requestBody,
    });

const redemption = {
    user: sessionUser,
    metadata: {
        codeUuid: 'code-0000-test',
        clientId: 'client-0000-test',
        reportedPlatform: 'ios',
    },
};

const createGrant = ({
    redeem = vi.fn(async () => redemption),
    withMobile = true,
    strict = false,
    saveToken = vi.fn(async (token, tokenClient, user) => ({
        ...token,
        client: tokenClient,
        user,
    })),
    validateScope,
}: {
    redeem?: MobileSignInService['redeem'];
    withMobile?: boolean;
    strict?: boolean;
    saveToken?: OAuth2Server.AuthorizationCodeModel['saveToken'];
    validateScope?: OAuth2Server.AuthorizationCodeModel['validateScope'];
} = {}) => {
    const recordRedeemAllowed = vi.fn();
    const exchangeIdToken = vi.fn();
    const mobileSignInService = {
        redeem,
        recordRedeemAllowed,
    } as unknown as MobileSignInService;
    const GrantType = createMicrosoftTokenExchangeGrantType(
        () => ({ exchangeIdToken }) as unknown as ManagedSignInService,
        async () => strict,
        'https://server.example',
        withMobile ? () => mobileSignInService : undefined,
    );
    const grant = new GrantType({
        accessTokenLifetime: 3600,
        refreshTokenLifetime: 7200,
        model: {
            saveToken,
            ...(validateScope ? { validateScope } : {}),
        } as unknown as OAuth2Server.AuthorizationCodeModel,
    } as unknown as OAuth2Server.TokenOptions);
    return { grant, redeem, saveToken, recordRedeemAllowed, exchangeIdToken };
};

describe('token exchange with a mobile sign-in code', () => {
    it('issues tokens for the redeemed user and audits after saving', async () => {
        const order: string[] = [];
        const { grant, redeem, recordRedeemAllowed, exchangeIdToken } =
            createGrant({
                saveToken: vi.fn(async (token, tokenClient, user) => {
                    order.push('saveToken');
                    return { ...token, client: tokenClient, user };
                }) as unknown as OAuth2Server.AuthorizationCodeModel['saveToken'],
            });
        recordRedeemAllowed.mockImplementation(() => order.push('audit'));
        const request = createRequest(body);
        setTokenRequestClientIp(request, '203.0.113.7');

        const token = await grant.handle(request, client);

        expect(token.accessToken).toBeTruthy();
        expect(token.refreshToken).toBeTruthy();
        expect(token.scope).toEqual(['read']);
        expect(redeem).toHaveBeenCalledWith(
            {
                code: body.subject_token,
                clientId: 'client-0000-test',
                codeVerifier: body.code_verifier,
                matchNumber: '42',
                isScopeAllowed: expect.any(Function),
            },
            { ip: '203.0.113.7', userAgent: undefined },
        );
        expect(recordRedeemAllowed).toHaveBeenCalledWith(redemption, {
            ip: '203.0.113.7',
            userAgent: undefined,
        });
        expect(order).toEqual(['saveToken', 'audit']);
        expect(exchangeIdToken).not.toHaveBeenCalled();
    });

    it('binds tokens to the API resource in strict mode', async () => {
        const { grant } = createGrant({ strict: true });
        const token = await grant.handle(createRequest(body), client);
        expect(token.resource).toBe('https://server.example');
        expect(token.familyUuid).toBeTruthy();
    });

    it.each([
        ['authorization_pending', undefined, 400],
        ['slow_down', undefined, 400],
        ['access_denied', 'declined', 400],
        ['match_number_required', 'approved', 400],
        ['expired_token', undefined, 400],
        ['invalid_grant', 'wrong_number', 400],
        ['rate_limited', undefined, 429],
    ] as const)(
        'turns %s into an OAuth error with that name',
        async (error, description, statusCode) => {
            const { grant, saveToken, recordRedeemAllowed } = createGrant({
                redeem: vi.fn(async () => {
                    throw new MobileSignInOAuthError(error, {
                        description,
                        statusCode,
                        retryAfterSeconds: statusCode === 429 ? 30 : undefined,
                    });
                }) as unknown as MobileSignInService['redeem'],
            });
            const caught = await grant
                .handle(createRequest(body), client)
                .catch((thrown: unknown) => thrown);
            expect(caught).toBeInstanceOf(MobileSignInGrantError);
            expect(caught).toBeInstanceOf(OAuth2Server.OAuthError);
            expect(caught).toMatchObject({
                name: error,
                code: statusCode,
                message: description ?? error,
            });
            expect(saveToken).not.toHaveBeenCalled();
            expect(recordRedeemAllowed).not.toHaveBeenCalled();
        },
    );

    it('passes an omitted match_number through as a probe and issues no token', async () => {
        const redeem = vi.fn(async () => {
            throw new MobileSignInOAuthError('match_number_required', {
                description: 'approved',
            });
        }) as unknown as MobileSignInService['redeem'];
        const { grant, saveToken } = createGrant({ redeem });
        const { match_number: omitted, ...probeBody } = body;
        const caught = await grant
            .handle(createRequest(probeBody), client)
            .catch((thrown: unknown) => thrown);
        expect(omitted).toBe('42');
        expect(redeem).toHaveBeenCalledWith(
            expect.objectContaining({ matchNumber: undefined }),
            expect.anything(),
        );
        expect(caught).toMatchObject({
            name: 'match_number_required',
            message: 'approved',
            code: 400,
        });
        expect(saveToken).not.toHaveBeenCalled();
    });

    it('rejects the mobile token type when the service is not wired', async () => {
        const { grant } = createGrant({ withMobile: false });
        await expect(
            grant.handle(createRequest(body), client),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
    });

    it('hands the redeem a scope check that uses the client scopes', async () => {
        let isScopeAllowed: ((user: SessionUser) => Promise<boolean>) | null =
            null;
        const { grant } = createGrant({
            redeem: vi.fn(async (args) => {
                isScopeAllowed = args.isScopeAllowed;
                return redemption;
            }) as unknown as MobileSignInService['redeem'],
        });
        await grant.handle(createRequest(body), client);
        expect(isScopeAllowed).not.toBeNull();
        await expect(isScopeAllowed!(sessionUser)).resolves.toBe(true);
    });
});

describe('mobile sign-in code grant scope', () => {
    const registeredClient = {
        ...client,
        scopes: ['read', 'write'],
    } as unknown as OAuth2Server.Client;

    const createScopedGrant = () => {
        const consumeCode = vi.fn();
        const validateScope = vi.fn(
            async (
                _user: OAuth2Server.User,
                scopeClient: OAuth2Server.Client,
                scope: string[] = [],
            ) => {
                const registered: string[] = scopeClient.scopes ?? [];
                return scope.every(
                    (requested) =>
                        registered.length === 0 ||
                        registered.includes(requested),
                )
                    ? scope
                    : false;
            },
        );
        const redeem = vi.fn(async (args) => {
            if (!(await args.isScopeAllowed(sessionUser))) {
                throw new MobileSignInOAuthError('invalid_scope');
            }
            consumeCode();
            return redemption;
        });
        const { grant, saveToken } = createGrant({
            redeem: redeem as unknown as MobileSignInService['redeem'],
            validateScope:
                validateScope as unknown as OAuth2Server.AuthorizationCodeModel['validateScope'],
        });
        return { grant, saveToken, redeem, validateScope, consumeCode };
    };

    const { scope: omittedScope, ...bodyWithoutScope } = body;

    it('mobile grant, omitted scope: issues the client registered scopes', async () => {
        const { grant, saveToken, redeem, validateScope, consumeCode } =
            createScopedGrant();

        const token = await grant.handle(
            createRequest(bodyWithoutScope),
            registeredClient,
        );

        expect(omittedScope).toBe('read');
        expect(token.scope).toEqual(['read', 'write']);
        expect(saveToken).toHaveBeenCalledWith(
            expect.objectContaining({ scope: ['read', 'write'] }),
            registeredClient,
            sessionUser,
        );
        expect(redeem).toHaveBeenCalledTimes(1);
        expect(consumeCode).toHaveBeenCalledTimes(1);
        expect(validateScope).toHaveBeenCalledTimes(2);
        expect(validateScope).toHaveBeenNthCalledWith(
            1,
            sessionUser,
            registeredClient,
            ['read', 'write'],
        );
        expect(validateScope).toHaveBeenNthCalledWith(
            2,
            sessionUser,
            registeredClient,
            ['read', 'write'],
        );
    });

    it('mobile grant, explicit scope read: issues exactly read', async () => {
        const { grant, saveToken, validateScope } = createScopedGrant();

        const token = await grant.handle(
            createRequest({ ...bodyWithoutScope, scope: 'read' }),
            registeredClient,
        );

        expect(token.scope).toEqual(['read']);
        expect(saveToken).toHaveBeenCalledWith(
            expect.objectContaining({ scope: ['read'] }),
            registeredClient,
            sessionUser,
        );
        expect(validateScope).toHaveBeenCalledWith(
            sessionUser,
            registeredClient,
            ['read'],
        );
        expect(validateScope).not.toHaveBeenCalledWith(
            sessionUser,
            registeredClient,
            ['read', 'write'],
        );
    });

    it('mobile grant, explicit scope not registered: refuses with invalid_scope and does not redeem the code', async () => {
        const { grant, saveToken, consumeCode } = createScopedGrant();

        const caught = await grant
            .handle(
                createRequest({ ...bodyWithoutScope, scope: 'mcp:write' }),
                registeredClient,
            )
            .catch((thrown: unknown) => thrown);

        expect(caught).toBeInstanceOf(OAuth2Server.InvalidScopeError);
        expect(caught).toMatchObject({ name: 'invalid_scope' });
        expect(consumeCode).not.toHaveBeenCalled();
        expect(saveToken).not.toHaveBeenCalled();
    });

    it('mobile grant, no registered scopes and no request scope: refuses with invalid_scope before redeem', async () => {
        const { grant, saveToken, redeem, consumeCode } = createScopedGrant();

        const caught = await grant
            .handle(createRequest(bodyWithoutScope), client)
            .catch((thrown: unknown) => thrown);

        expect(caught).toBeInstanceOf(OAuth2Server.InvalidScopeError);
        expect(caught).toMatchObject({ name: 'invalid_scope' });
        expect(redeem).not.toHaveBeenCalled();
        expect(consumeCode).not.toHaveBeenCalled();
        expect(saveToken).not.toHaveBeenCalled();
    });
});
