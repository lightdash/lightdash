import { ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const deleteUserQuery = async () =>
    lightdashApi<null>({
        url: `/user/me`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteUserMutation = () =>
    useMutation<null, ApiError>(deleteUserQuery, {
        mutationKey: ['user_delete'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });
