import {
    type Account,
    type AccountHelpers,
    type AccountWithoutHelpers,
} from '../types/auth';

export const buildAccountHelpers = <T extends Account>(
    account: AccountWithoutHelpers<T>,
): AccountHelpers => ({
    isAuthenticated: () => !!account.authentication && !!account.user?.id,
    isRegisteredUser: () => account.user?.type === 'registered',
    isAnonymousUser: () => account.user?.type === 'anonymous',
    isSessionUser: () => account.authentication?.type === 'session',
    isJwtUser: () => account.authentication?.type === 'jwt',
    isServiceAccount: () => account.authentication?.type === 'service-account',
    isPatUser: () => account.authentication?.type === 'pat',
    isOauthUser: () => account.authentication?.type === 'oauth',
});
