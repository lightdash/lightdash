import {
    ID_TOKEN_TYPE,
    ManagedSignInError,
    type SessionUser,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { ManagedSignInRejection } from './ManagedSignInRejection';
import type { ManagedSignInService } from './ManagedSignInService';
import { createMicrosoftTokenExchangeGrantType } from './microsoftTokenExchangeGrantType';

const sessionUser = {
    userId: 7,
    organizationUuid: 'org-uuid',
} as SessionUser;

const client = {
    id: 'lightdash-mobile',
    grants: [],
} as unknown as OAuth2Server.Client;

const createRequest = (body: Record<string, unknown>) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        query: {},
        body,
    });

const createGrant = ({
    exchangeIdToken = vi.fn(async () => sessionUser),
    recordSignInAllowed = vi.fn(),
    saveToken = vi.fn(async (token, tokenClient, user) => ({
        ...token,
        client: tokenClient,
        user,
    })),
    validateScope,
    strict = false,
}: {
    strict?: boolean;
    exchangeIdToken?: ManagedSignInService['exchangeIdToken'];
    recordSignInAllowed?: ManagedSignInService['recordSignInAllowed'];
    saveToken?: OAuth2Server.AuthorizationCodeModel['saveToken'];
    validateScope?: OAuth2Server.AuthorizationCodeModel['validateScope'];
} = {}) => {
    const managedSignInService = {
        exchangeIdToken,
        recordSignInAllowed,
    } as unknown as ManagedSignInService;
    const GrantType = createMicrosoftTokenExchangeGrantType(
        () => managedSignInService,
        async () => strict,
        'https://server.example',
    );
    const model = {
        saveToken,
        ...(validateScope ? { validateScope } : {}),
    } as unknown as OAuth2Server.AuthorizationCodeModel;
    const grant = new GrantType({
        accessTokenLifetime: 3600,
        refreshTokenLifetime: 7200,
        model,
    } as unknown as OAuth2Server.TokenOptions);
    return { grant, exchangeIdToken, saveToken, recordSignInAllowed };
};

const validBody = {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: 'a-microsoft-id-token',
    subject_token_type: ID_TOKEN_TYPE,
    scope: 'read',
};

describe('MicrosoftTokenExchangeGrantType', () => {
    it('issues a token for the exchanged user', async () => {
        const { grant, exchangeIdToken, saveToken } = createGrant();

        const token = await grant.handle(createRequest(validBody), client);

        expect(exchangeIdToken).toHaveBeenCalledWith({
            subjectToken: 'a-microsoft-id-token',
            clientId: 'lightdash-mobile',
            ip: undefined,
            userAgent: undefined,
        });
        expect(token.accessToken).toBeTruthy();
        expect(token.refreshToken).toBeTruthy();
        expect(token.scope).toEqual(['read']);
        expect(vi.mocked(saveToken)).toHaveBeenCalledWith(
            expect.objectContaining({ scope: ['read'] }),
            client,
            sessionUser,
        );
    });

    it('records the allowed audit event only after the tokens are saved', async () => {
        const order: string[] = [];
        const { grant, recordSignInAllowed } = createGrant({
            saveToken: vi.fn(async (token, tokenClient, user) => {
                order.push('saveToken');
                return { ...token, client: tokenClient, user };
            }) as unknown as OAuth2Server.AuthorizationCodeModel['saveToken'],
            recordSignInAllowed: vi.fn(() => {
                order.push('audit');
            }) as unknown as ManagedSignInService['recordSignInAllowed'],
        });

        await grant.handle(createRequest(validBody), client);

        expect(order).toEqual(['saveToken', 'audit']);
        expect(vi.mocked(recordSignInAllowed)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(recordSignInAllowed)).toHaveBeenCalledWith(
            sessionUser,
            { ip: undefined, userAgent: undefined },
        );
    });

    it('records no allowed audit event when the exchange refuses', async () => {
        const { grant, recordSignInAllowed } = createGrant({
            exchangeIdToken: vi.fn(async () => {
                throw new ManagedSignInRejection(
                    ManagedSignInError.USER_NOT_ALLOWED,
                    'user does not belong to the tenant organization',
                );
            }) as unknown as ManagedSignInService['exchangeIdToken'],
        });

        await expect(
            grant.handle(createRequest(validBody), client),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
        expect(vi.mocked(recordSignInAllowed)).not.toHaveBeenCalled();
    });

    it('records no allowed audit event when the token was replayed', async () => {
        const { grant, recordSignInAllowed } = createGrant({
            exchangeIdToken: vi.fn(async () => {
                throw new ManagedSignInRejection(
                    ManagedSignInError.TOKEN_REPLAYED,
                    'token hash is already recorded',
                );
            }) as unknown as ManagedSignInService['exchangeIdToken'],
        });

        await expect(
            grant.handle(createRequest(validBody), client),
        ).rejects.toMatchObject({
            name: 'invalid_grant',
            message: ManagedSignInError.TOKEN_REPLAYED,
        });
        expect(vi.mocked(recordSignInAllowed)).not.toHaveBeenCalled();
    });

    it('records no allowed audit event when saving the token fails', async () => {
        const { grant, recordSignInAllowed } = createGrant({
            saveToken: vi.fn(
                async () => undefined,
            ) as unknown as OAuth2Server.AuthorizationCodeModel['saveToken'],
        });

        await expect(
            grant.handle(createRequest(validBody), client),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
        expect(vi.mocked(recordSignInAllowed)).not.toHaveBeenCalled();
    });

    it('rejects a missing subject token', async () => {
        const { grant } = createGrant();

        await expect(
            grant.handle(
                createRequest({ ...validBody, subject_token: '' }),
                client,
            ),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
    });

    it('rejects a subject token type that is not an id token', async () => {
        const { grant } = createGrant();

        await expect(
            grant.handle(
                createRequest({
                    ...validBody,
                    subject_token_type:
                        'urn:ietf:params:oauth:token-type:access_token',
                }),
                client,
            ),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
    });

    it.each(Object.values(ManagedSignInError))(
        'returns invalid_grant with %s',
        async (code) => {
            const { grant } = createGrant({
                exchangeIdToken: vi.fn(async () => {
                    throw new ManagedSignInRejection(code, 'detail');
                }) as unknown as ManagedSignInService['exchangeIdToken'],
            });

            await expect(
                grant.handle(createRequest(validBody), client),
            ).rejects.toMatchObject({
                name: 'invalid_grant',
                message: code,
            });
        },
    );

    it('never leaks an unexpected failure message', async () => {
        const { grant } = createGrant({
            exchangeIdToken: vi.fn(async () => {
                throw new Error('connect ECONNREFUSED 10.0.0.1:5432');
            }) as unknown as ManagedSignInService['exchangeIdToken'],
        });

        await expect(
            grant.handle(createRequest(validBody), client),
        ).rejects.toMatchObject({
            name: 'invalid_grant',
            message: ManagedSignInError.TOKEN_INVALID,
        });
    });

    it('rejects a scope the model refuses', async () => {
        const { grant } = createGrant({
            validateScope: vi.fn(
                async () => undefined,
            ) as unknown as OAuth2Server.AuthorizationCodeModel['validateScope'],
        });

        await expect(
            grant.handle(createRequest(validBody), client),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidScopeError);
    });
});

it.each([true, false])(
    'binds managed sign-in tokens to API only under strict=%s',
    async (strict) => {
        const { grant, saveToken } = createGrant({ strict });
        const token = await grant.handle(createRequest(validBody), client);
        expect(token.resource).toBe(strict ? 'https://server.example' : null);
        expect(saveToken).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: strict ? 'https://server.example' : null,
            }),
            client,
            sessionUser,
        );
    },
);

it.each([
    { resource: 'https://foreign.example' },
    { resource: ['https://server.example', 'https://server.example'] },
    { resource: 'not a URL' },
    { resource: 'https://server.example/api/v1/mcp' },
])(
    'refuses managed sign-in resource $resource under strict without saving tokens',
    async ({ resource }) => {
        const { grant, saveToken, recordSignInAllowed } = createGrant({
            strict: true,
        });
        await expect(
            grant.handle(createRequest({ ...validBody, resource }), client),
        ).rejects.toMatchObject({ name: 'invalid_target' });
        expect(saveToken).not.toHaveBeenCalled();
        expect(recordSignInAllowed).not.toHaveBeenCalled();
    },
);

it('refuses a resource duplicated across body and query without saving tokens', async () => {
    const { grant, saveToken } = createGrant({ strict: true });
    const request = createRequest({
        ...validBody,
        resource: 'https://server.example',
    });
    request.query = { resource: 'https://server.example' };
    await expect(grant.handle(request, client)).rejects.toMatchObject({
        name: 'invalid_target',
    });
    expect(saveToken).not.toHaveBeenCalled();
});

it.each([null, 'https://server.example'])(
    'binds managed sign-in resource %s to the API under strict',
    async (resource) => {
        const { grant, saveToken } = createGrant({ strict: true });
        const token = await grant.handle(
            createRequest({
                ...validBody,
                ...(resource === null ? {} : { resource }),
            }),
            client,
        );
        expect(token.resource).toBe('https://server.example');
        expect(saveToken).toHaveBeenCalledWith(
            expect.objectContaining({ resource: 'https://server.example' }),
            client,
            sessionUser,
        );
    },
);

it('ignores invalid resources with the flag off', async () => {
    const { grant } = createGrant();
    const token = await grant.handle(
        createRequest({
            ...validBody,
            resource: ['not a URL', 'https://foreign.example'],
        }),
        client,
    );
    expect(token.resource).toBeNull();
});
