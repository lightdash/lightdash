import { Ability } from '@casl/ability';
import {
    type Account,
    type AccountWithoutHelpers,
    type AnonymousAccount,
    type ApiKeyAccount,
    type ServiceAcctAccount,
    type SessionAccount,
} from '../types/auth';
import { buildAccountHelpers } from './buildAccountHelpers';
import { type PossibleAbilities } from './types';

/**
 * Reconstruct the full account with abilities and helper methods
 */
export const parseAccount = (
    deserializedAccount: AccountWithoutHelpers<Account>,
) => {
    const account = {
        ...deserializedAccount,
        user: {
            ...deserializedAccount.user,
            ability: new Ability<PossibleAbilities>(
                deserializedAccount.user.abilityRules,
            ),
        },
        ...buildAccountHelpers(
            deserializedAccount as AccountWithoutHelpers<Account>,
        ),
    };

    switch (account.authentication.type) {
        case 'session':
            return account as SessionAccount;
        case 'pat':
            return account as ApiKeyAccount;
        case 'jwt':
            return account as AnonymousAccount;
        case 'service-account':
            return account as ServiceAcctAccount;
        default:
            return account;
    }
};
