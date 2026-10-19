import {
    parseAccount,
    type Account,
    type AccountWithoutHelpers,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

/**
 * Returns a discriminated union of account if we get a type parameter, otherwise returns the union Account.
 * If you're uncertain of the type, use a type guard against the union Account to get the specified type at runtime..
 */
const getAccount = async <T extends Account>(
    lightdashApi: LightdashApi,
): Promise<T> => {
    const accountData = await lightdashApi<Account>({
        url: `/user/account`,
        method: 'GET',
    });

    return parseAccount(accountData as AccountWithoutHelpers<Account>) as T;
};

export const useAccount = <T extends Account>(
    isAuthenticated: boolean = true,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<T, ApiError>({
        queryKey: ['account'],
        queryFn: () => getAccount<T>(lightdashApi),
        enabled: isAuthenticated,
        retry: false,
    });
};
