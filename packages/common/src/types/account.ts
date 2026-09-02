import {
    type Account,
    type AccountOrganization,
    type AnonymousAccount,
    type AuthType,
} from './auth';

/**
 * The account as returned by the API. Kept to what the app needs so a session
 * never echoes its own credential (cookie, token, key) or, for embeds, the
 * embed configuration behind the JWT.
 *
 * We omit AbilityRules because tsoa is very unforgiving. We'll still get this in the UI to apply abilities.
 * The same approach is taken for SessionUser from the UserController.
 */
export type SerializedAccount = {
    organization: AccountOrganization;
    authentication: { type: AuthType };
    user: Omit<Account['user'], 'ability' | 'abilityRules'>;
    embedWriteContext?: AnonymousAccount['embedWriteContext'];
};

export type ApiGetAccountResponse = {
    status: 'ok';
    results: SerializedAccount;
};
