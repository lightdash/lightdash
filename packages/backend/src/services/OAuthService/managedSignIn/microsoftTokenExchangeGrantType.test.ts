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

const createRequest = (body: Record<string, string>) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        query: {},
        body,
    });

const createGrant = ({
    exchangeIdToken = vi.fn(async () => sessionUser),
    saveToken = vi.fn(async (token, tokenClient, user) => ({
        ...token,
        client: tokenClient,
        user,
    })),
    validateScope,
}: {
    exchangeIdToken?: ManagedSignInService['exchangeIdToken'];
    saveToken?: OAuth2Server.AuthorizationCodeModel['saveToken'];
    validateScope?: OAuth2Server.AuthorizationCodeModel['validateScope'];
} = {}) => {
    const managedSignInService = {
        exchangeIdToken,
    } as unknown as ManagedSignInService;
    const GrantType = createMicrosoftTokenExchangeGrantType(
        () => managedSignInService,
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
    return { grant, exchangeIdToken, saveToken };
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
