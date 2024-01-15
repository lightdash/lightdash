import { ApiError, ApiSuccessEmpty } from '@lightdash/common';
import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const logoutQuery = async () =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const useLogoutMutation = (
    options: UseMutationOptions<ApiSuccessEmpty, ApiError, void>,
) => {
    return useMutation(logoutQuery, {
        mutationKey: ['logout'],
        ...options,
    });
};

export default useLogoutMutation;
