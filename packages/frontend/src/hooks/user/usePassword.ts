import { Ability } from '@casl/ability';
import { ApiError, LightdashUserWithAbilityRules } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getUserHasPassword = async (): Promise<boolean> =>
    lightdashApi<boolean>({
        url: `/user/password`,
        method: 'GET',
        body: undefined,
    });

const useUserHasPassword = () => {
    return useQuery<boolean, ApiError>({
        queryKey: 'user-has-password',
        queryFn: getUserHasPassword,
    });
};

export default useUserHasPassword;
