import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const deleteUserQuery = async (lightdashApi: LightdashApi) =>
    lightdashApi<null>({
        url: `/user/me`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteUserMutation = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<null, ApiError>(() => deleteUserQuery(lightdashApi), {
        mutationKey: ['user_delete'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });
};
