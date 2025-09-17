import { type ApiError, type ApiSuccessEmpty } from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { clearCsrfToken, lightdashApi } from '../../api';

const logoutQuery = async () => {
    const result = await lightdashApi<ApiSuccessEmpty>({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

    // Clear CSRF token cache on logout
    clearCsrfToken();

    return result;
};

const useLogoutMutation = (
    options: UseMutationOptions<ApiSuccessEmpty, ApiError, void>,
) => {
    return useMutation(logoutQuery, {
        mutationKey: ['logout'],
        ...options,
    });
};

export default useLogoutMutation;
