import { type ApiError, type ApiSuccessEmpty } from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const logoutQuery = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const useLogoutMutation = (
    options: UseMutationOptions<ApiSuccessEmpty, ApiError, void>,
) => {
    const lightdashApi = useLightdashApi();
    return useMutation(() => logoutQuery(lightdashApi), {
        mutationKey: ['logout'],
        ...options,
    });
};

export default useLogoutMutation;
