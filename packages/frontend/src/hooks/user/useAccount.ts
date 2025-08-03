import {
    type Account,
    type AccountWithoutHelpers,
    type ApiError,
    parseAccount,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

/**
 * Returns a discriminated union of account if we get a type parameter, otherwise returns the union Account.
 * If you're uncertain of the type, use a type guard against the union Account to get the specified type at runtime..
 */
const getAccount = async <T extends Account>(): Promise<T> => {
    const accountData = await lightdashApi<Account>({
        url: `/user/account`,
        method: 'GET',
    });

    return parseAccount(accountData as AccountWithoutHelpers<Account>) as T;
};

export const useAccount = <T extends Account>(
    isAuthenticated: boolean = true,
) => {
    return useQuery<T, ApiError>({
        queryKey: ['account'],
        queryFn: getAccount,
        enabled: isAuthenticated,
        retry: false,
    });
};
