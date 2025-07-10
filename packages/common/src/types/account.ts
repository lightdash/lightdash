import { type Account } from './auth';

export type SerializedAccount = Omit<Account, 'user'> & {
    user: Omit<Account['user'], 'ability' | 'abilityRules'>;
};

export type ApiGetAccountResponse = {
    status: 'ok';
    results: SerializedAccount;
};
