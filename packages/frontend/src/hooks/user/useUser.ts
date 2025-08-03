import { Ability } from '@casl/ability';
import {
    type ApiError,
    type LightdashUserWithAbilityRules,
    type PossibleAbilities,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { useAccount } from './useAccount';

export type UserWithAbility = LightdashUserWithAbilityRules & {
    ability: Ability;
};
const getUserState = async (): Promise<UserWithAbility> => {
    const user = await lightdashApi<LightdashUserWithAbilityRules>({
        url: `/user`,
        method: 'GET',
        body: undefined,
    });

    return {
        ...user,
        ability: new Ability<PossibleAbilities>(user.abilityRules),
    };
};

const useUser = (isAuthenticated: boolean) => {
    const { data: account } = useAccount();

    return useQuery<UserWithAbility, ApiError>({
        queryKey: ['user'],
        queryFn: getUserState,
        enabled: isAuthenticated && account?.isRegisteredUser(),
        retry: false,
    });
};

export default useUser;
