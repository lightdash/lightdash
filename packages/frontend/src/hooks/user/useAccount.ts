import { Ability } from '@casl/ability';
import {
    type Account,
    type ApiError,
    type PossibleAbilities,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getAccountState = async (): Promise<Account> => {
    const account = await lightdashApi<Account>({
        url: `/user/account`,
        method: 'GET',
    });

    account.user.ability = new Ability<PossibleAbilities>(
        account.user.abilityRules,
    );

    return account;
};

export const useAccount = () => {
    return useQuery<Account, ApiError>({
        queryKey: ['account'],
        queryFn: getAccountState,
        retry: false,
    });
};
