import {
    type Account,
    type AccountWithoutHelpers,
    type ApiError,
    parseAccount,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

/**
 * Returns the union Account without making the discriminated type explicit.
 * This is because we don't know anything at build time, we only know at runtime when we get the account data.
 * Use typeguards if you need to access a specific field that is unique to a given Account type.
 */
const getAccount = async (): Promise<Account> => {
    const accountData = await lightdashApi<Account>({
        url: `/user/account`,
        method: 'GET',
        body: undefined,
    });

    return parseAccount(
        accountData as AccountWithoutHelpers<Account>,
    ) as Account;
};

export const useAccount = (isAuthenticated: boolean = true) => {
    return useQuery<Account, ApiError>({
        queryKey: ['account'],
        queryFn: getAccount,
        enabled: isAuthenticated,
        retry: false,
    });
};
