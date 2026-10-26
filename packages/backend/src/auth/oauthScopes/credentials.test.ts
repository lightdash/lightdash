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
import {
    assertOAuthCredentialOperationAllowed,
    OAUTH_CREDENTIAL_OPERATIONS,
} from './credentials';

const operations = [
    ['startOnboardingRun', 'create', 'OnboardingRunCredential'],
    ['enqueueLearnSandboxCommand', 'create', 'LearnSandboxCredential'],
    ['createPersonalAccessToken', 'create', 'PersonalAccessToken'],
    ['rotatePersonalAccessToken', 'rotate', 'PersonalAccessToken'],
    ['createServiceAccount', 'create', 'ServiceAccount'],
    ['rotateServiceAccount', 'rotate', 'ServiceAccount'],
    ['createScimToken', 'create', 'ScimToken'],
    ['rotateScimToken', 'rotate', 'ScimToken'],
    ['createOAuthClient', 'create', 'OAuthClient'],
    ['updateOAuthClient', 'update', 'OAuthClient'],
    ['deleteOAuthClient', 'delete', 'OAuthClient'],
] as const;

const user = {
    ...defaultSessionUser,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
};

const oauthAccount = (scopes: string[], defaultPolicy: boolean) =>
    fromOauth(
        user,
        { accessToken: 'secret', client: { id: 'client' }, scope: scopes },
        defaultPolicy
            ? undefined
            : {
                  getRequest: () => ({
                      method: 'POST',
                      routeTemplate: '/credentials',
                  }),
              },
    );

describe('OAuth credential minting', () => {
    it('covers every credential operation', () => {
        expect(operations.map(([operation]) => operation)).toEqual(
            Object.keys(OAUTH_CREDENTIAL_OPERATIONS),
        );
    });
    beforeEach(() => {
        vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    });
    afterEach(() => vi.restoreAllMocks());

    describe.each([false, true])('default policy %s', (defaultPolicy) => {
        describe.each([[], ['read'], ['write'], ['mcp:read'], ['mcp:write']])(
            'scopes %j',
            (...scopes) => {
                it.each(operations)('refuses %s', (operation) => {
                    const account = oauthAccount(scopes, defaultPolicy);
                    expect(() =>
                        assertOAuthCredentialOperationAllowed(
                            account,
                            operation,
                        ),
                    ).toThrow(ForbiddenError);
                    expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
                        'oauth_credential_mint_refused',
                        {
                            operation,
                            clientId: 'client',
                            scopes,
                            userAgent: null,
                            cliVersion: null,
                            organizationUuid: user.organizationUuid,
                        },
                    );
                    expect(
                        JSON.stringify(vi.mocked(Logger.warn).mock.calls),
                    ).not.toContain('secret');
                });
            },
        );
        it.each(operations)(
            'refuses %s after conversion to a session user',
            (operation) => {
                const account = oauthAccount(['write'], defaultPolicy);
                expect(() =>
                    assertOAuthCredentialOperationAllowed(
                        toSessionUser(account),
                        operation,
                    ),
                ).toThrow(ForbiddenError);
                expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
                    'oauth_credential_mint_refused',
                    expect.objectContaining({
                        operation,
                        clientId: 'client',
                        scopes: ['write'],
                        userAgent: null,
                    }),
                );
            },
        );
    });

    it.each(operations)(
        'refuses %s without an OAuth scope context',
        (operation) => {
            const account = oauthAccount(['write'], true);
            account.user.ability = user.ability;
            expect(() =>
                assertOAuthCredentialOperationAllowed(account, operation),
            ).toThrow(ForbiddenError);
            expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
                'oauth_credential_mint_refused',
                expect.objectContaining({
                    operation,
                    clientId: 'client',
                    scopes: ['write'],
                    userAgent: null,
                }),
            );
        },
    );

    it('refuses the CLI client even with empty scopes', () => {
        const account = fromOauth(user, {
            accessToken: 'never-log-this-token',
            client: { id: 'lightdash-cli' },
            scope: [],
        });
        account.requestContext = {
            userAgent: 'cli-agent',
            cliVersion: '3.56.0',
        };
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
                clientId: 'lightdash-cli',
                scopes: [],
                userAgent: 'cli-agent',
                cliVersion: '3.56.0',
                organizationUuid: user.organizationUuid,
            },
        );
        expect(JSON.stringify(vi.mocked(Logger.warn).mock.calls)).not.toContain(
            'never-log-this-token',
        );
    });

    it.each(operations)('preserves session user %s', (operation) => {
        expect(() =>
            assertOAuthCredentialOperationAllowed(user, operation),
        ).not.toThrow();
        expect(Logger.warn).not.toHaveBeenCalled();
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
