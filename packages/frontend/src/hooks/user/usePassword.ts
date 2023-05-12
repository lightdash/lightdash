import { ApiError } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getUserHasPassword = async (): Promise<boolean> =>
    lightdashApi<boolean>({
        url: `/user/password`,
        method: 'GET',
        body: undefined,
    });

export const useUserHasPassword = () =>
    useQuery<boolean, ApiError>({
        queryKey: 'user-has-password',
        queryFn: getUserHasPassword,
    });
