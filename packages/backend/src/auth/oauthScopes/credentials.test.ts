import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
    fromSession,
    toSessionUser,
} from '../account/account';
import { defaultSessionUser } from '../account/account.mock';
import { assertOAuthCredentialOperationAllowed } from './credentials';

const operations = [
    'enqueueLearnSandboxCommand',
    'createPersonalAccessToken',
    'rotatePersonalAccessToken',
    'createServiceAccount',
    'rotateServiceAccount',
    'createScimToken',
    'rotateScimToken',
    'createOAuthClient',
    'updateOAuthClient',
    'deleteOAuthClient',
] as const;

const user = {
    ...defaultSessionUser,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
};

const oauthAccount = (
    scopes: string[],
    clientId = 'client',
    withPolicy = true,
) =>
    fromOauth(
        user,
        { accessToken: 'secret', client: { id: clientId }, scope: scopes },
        withPolicy
            ? {
                  mode: 'enforce',
                  getRequest: () => ({
                      method: 'POST',
                      routeTemplate: '/credentials',
                  }),
              }
            : null,
    );

describe('OAuth credential minting', () => {
    beforeEach(() => {
        vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    });
    afterEach(() => vi.restoreAllMocks());

    describe.each([[], ['read'], ['write'], ['mcp:read'], ['mcp:write']])(
        'scopes %j',
        (...scopes) => {
            it.each(operations)('refuses %s', (operation) => {
                expect(() =>
                    assertOAuthCredentialOperationAllowed(
                        oauthAccount(scopes),
                        operation,
                    ),
                ).toThrow(ForbiddenError);
                expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
                    'oauth_credential_mint_refused',
                    {
                        operation,
                        clientId: 'client',
                        scopes,
                        cliVersion: null,
                    },
                );
            });
        },
    );

    it.each(operations)(
        'refuses %s after conversion to a session user',
        (operation) => {
            expect(() =>
                assertOAuthCredentialOperationAllowed(
                    toSessionUser(oauthAccount(['write'])),
                    operation,
                ),
            ).toThrow(ForbiddenError);
            expect(Logger.warn).toHaveBeenCalledWith(
                'oauth_credential_mint_refused',
                expect.objectContaining({
                    operation,
                    clientId: 'client',
                    scopes: ['write'],
                }),
            );
        },
    );

    it.each(operations)(
        'refuses %s for an OAuth account without a scope policy',
        (operation) => {
            expect(() =>
                assertOAuthCredentialOperationAllowed(
                    oauthAccount(['write'], 'client', false),
                    operation,
                ),
            ).toThrow(ForbiddenError);
        },
    );

    it.each([
        ['lightdash-cli/3.87.0', '3.87.0'],
        ['lightdash-cli/3.87.0-beta.1 node', '3.87.0-beta.1'],
        ['Mozilla/5.0 lightdash-cli/3.87.0', null],
        ['lightdash-cli/latest', null],
        [undefined, null],
    ])('logs the CLI version from user agent %j', (userAgent, cliVersion) => {
        const account = oauthAccount(['read', 'write']);
        account.requestContext = { userAgent };
        expect(() =>
            assertOAuthCredentialOperationAllowed(
                account,
                'createPersonalAccessToken',
            ),
        ).toThrow(ForbiddenError);
        expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
            'oauth_credential_mint_refused',
            {
                operation: 'createPersonalAccessToken',
                clientId: 'client',
                scopes: ['read', 'write'],
                cliVersion,
            },
        );
    });

    it('logs a metadata document client id without its query', () => {
        expect(() =>
            assertOAuthCredentialOperationAllowed(
                oauthAccount(
                    ['write', 'https://example.test/?token=secret'],
                    'https://client.example/metadata.json?token=secret',
                ),
                'createServiceAccount',
            ),
        ).toThrow(ForbiddenError);
        expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
            'oauth_credential_mint_refused',
            {
                operation: 'createServiceAccount',
                clientId: 'https://client.example/metadata.json',
                scopes: ['write', 'unknown'],
                cliVersion: null,
            },
        );
    });

    describe.each(['session', 'pat', 'service-account'] as const)(
        '%s accounts',
        (type) => {
            it.each(operations)('preserves %s', (operation) => {
                const factories = {
                    session: () => fromSession(user, 'cookie'),
                    pat: () => fromApiKey(user, 'secret'),
                    'service-account': () =>
                        fromServiceAccount(
                            {
                                ...user,
                                serviceAccount: {
                                    uuid: 'sa',
                                    description: 'service',
                                },
                            },
                            'secret',
                        ),
                };
                const account = factories[type]();
                expect(() =>
                    assertOAuthCredentialOperationAllowed(account, operation),
                ).not.toThrow();
                expect(Logger.warn).not.toHaveBeenCalled();
            });
        },
    );
});
