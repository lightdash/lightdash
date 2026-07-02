import { type ApiError, type ApiUserAvatarResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { downscaleAvatarImage } from './downscaleAvatarImage';

const uploadAvatar = async (
    file: File,
): Promise<ApiUserAvatarResponse['results']> => {
    const blob = await downscaleAvatarImage(file);
    const response = await fetch('/api/v1/user/me/avatar', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': blob.type },
        body: blob,
    });
    let json: unknown;
    try {
        json = await response.json();
    } catch (e) {
        throw new Error('Unexpected response uploading avatar');
    }
    if (!response.ok) {
        throw json;
    }
    return (json as ApiUserAvatarResponse).results;
};

export const useAvatarUploadMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<ApiUserAvatarResponse['results'], ApiError, File>({
        mutationKey: ['user_avatar_upload'],
        mutationFn: uploadAvatar,
        onSuccess: async () => {
            await queryClient.refetchQueries(['user']);
            await queryClient.invalidateQueries(['organization_users']);
        },
    });
};

const deleteAvatar = async () =>
    lightdashApi<undefined>({
        url: '/user/me/avatar',
        method: 'DELETE',
        body: undefined,
    });

export const useAvatarDeleteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError>({
        mutationKey: ['user_avatar_delete'],
        mutationFn: deleteAvatar,
        onSuccess: async () => {
            await queryClient.refetchQueries(['user']);
            await queryClient.invalidateQueries(['organization_users']);
        },
    });
};
