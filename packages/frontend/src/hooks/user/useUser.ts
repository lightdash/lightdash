import { Ability } from '@casl/ability';
import {
    type ApiError,
    type ImpersonationInfo,
    type LightdashUserWithAbilityRules,
    type PossibleAbilities,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { useAccount } from './useAccount';

export type UserWithAbility = LightdashUserWithAbilityRules & {
    ability: Ability;
    impersonation: ImpersonationInfo | null;
};
const getUserState = async (
    lightdashApi: LightdashApi,
): Promise<UserWithAbility> => {
    const user = await lightdashApi<
        LightdashUserWithAbilityRules & {
            impersonation: ImpersonationInfo | null;
        }
    >({
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
    const lightdashApi = useLightdashApi();
    const { data: account } = useAccount();

    return useQuery<UserWithAbility, ApiError>({
        queryKey: ['user'],
        queryFn: () => getUserState(lightdashApi),
        enabled: isAuthenticated && account?.isRegisteredUser(),
        retry: false,
    });
};

export default useUser;
