import { Ability } from '@casl/ability';
import { ApiError, LightdashUserWithDetails } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

export type UserWithAbility = LightdashUserWithDetails & {
    ability: Ability;
};
const getUserState = async (): Promise<UserWithAbility> => {
    const user = await lightdashApi<LightdashUserWithDetails>({
        url: `/user`,
        method: 'GET',
        body: undefined,
    });

    return {
        ...user,
        ability: new Ability(user.abilityRules),
    };
};

const useUser = (isAuthenticated: boolean) => {
    return useQuery<UserWithAbility, ApiError>({
        queryKey: 'user',
        queryFn: getUserState,
        enabled: isAuthenticated,
        retry: false,
    });
};

export default useUser;
