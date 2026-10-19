import { type ApiError, type ApiUserAvatarResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { downscaleAvatarImage } from './downscaleAvatarImage';
import { type UserWithAbility } from './useUser';

const uploadAvatar = async (
    lightdashApi: LightdashApi,
    file: File,
): Promise<ApiUserAvatarResponse['results']> => {
    const blob = await downscaleAvatarImage(file);
    return lightdashApi<ApiUserAvatarResponse['results']>({
        url: '/user/me/avatar',
        method: 'PUT',
        headers: { 'Content-Type': blob.type },
        body: blob,
    });
};

export const useAvatarUploadMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<ApiUserAvatarResponse['results'], ApiError, File>({
        mutationKey: ['user_avatar_upload'],
        mutationFn: (file: File) => uploadAvatar(lightdashApi, file),
        onSuccess: async (data) => {
            queryClient.setQueryData<UserWithAbility>(['user'], (previous) =>
                previous
                    ? { ...previous, avatarUrl: data.avatarUrl }
                    : previous,
            );
            await queryClient.invalidateQueries(['organization_users']);
        },
    });
};

const deleteAvatar = async (lightdashApi: LightdashApi) =>
    lightdashApi<undefined>({
        url: '/user/me/avatar',
        method: 'DELETE',
        body: undefined,
    });

export const useAvatarDeleteMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError>({
        mutationKey: ['user_avatar_delete'],
        mutationFn: () => deleteAvatar(lightdashApi),
        onSuccess: async () => {
            queryClient.setQueryData<UserWithAbility>(['user'], (previous) =>
                previous ? { ...previous, avatarUrl: null } : previous,
            );
            await queryClient.invalidateQueries(['organization_users']);
        },
    });
};
