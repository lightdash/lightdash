import { type Account, type AccountHelpers } from './auth';

// We omit AbilityRules because tsoa is very unforgiving. We'll still get this in the UI to apply abilities.
// The same approach is taken for SessionUser from the UserController.
export type SerializedAccount = Omit<Account, 'user' | keyof AccountHelpers> & {
    user: Omit<Account['user'], 'ability' | 'abilityRules'>;
};

export type ApiGetAccountResponse = {
    status: 'ok';
    results: SerializedAccount;
};
