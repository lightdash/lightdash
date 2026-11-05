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

const oauthAccount = (mode: 'log' | 'enforce' | null, scopes: string[]) =>
    fromOauth(
        user,
        { accessToken: 'secret', client: { id: 'client' }, scope: scopes },
        mode === null
            ? null
            : {
                  mode,
                  getRequest: () => ({
                      method: 'POST',
                      routeTemplate: '/credentials',
                  }),
              },
    );

describe('OAuth credential minting', () => {
    beforeEach(() => {
        vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    });
    afterEach(() => vi.restoreAllMocks());

    describe.each(['log', 'enforce'] as const)('%s mode', (mode) => {
        describe.each([[], ['read'], ['write'], ['mcp:read'], ['mcp:write']])(
            'scopes %j',
            (...scopes) => {
                it.each(operations)(
                    'refuses %s',
                    (operation, action, subjectType) => {
                        const account = oauthAccount(mode, scopes);
                        expect(() =>
                            assertOAuthCredentialOperationAllowed(
                                account,
                                operation,
                            ),
                        ).toThrow(ForbiddenError);
                        expect(() =>
                            assertOAuthCredentialOperationAllowed(
                                account,
                                operation,
                            ),
                        ).toThrow(ForbiddenError);
                        expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
                            'oauth_scope_refusal',
                            {
                                mode,
                                clientId: 'client',
                                scopes,
                                method: 'POST',
                                routeTemplate: '/credentials',
                                toolName: null,
                                action,
                                subjectType,
                            },
                        );
                    },
                );
            },
        );
        it.each(operations)(
            'refuses %s after conversion to a session user',
            (operation) => {
                const account = oauthAccount(mode, ['write']);
                expect(() =>
                    assertOAuthCredentialOperationAllowed(
                        toSessionUser(account),
                        operation,
                    ),
                ).toThrow(ForbiddenError);
            },
        );
    });

    it.each(operations)('preserves flag-off OAuth %s', (operation) => {
        expect(() =>
            assertOAuthCredentialOperationAllowed(
                oauthAccount(null, ['write']),
                operation,
            ),
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
