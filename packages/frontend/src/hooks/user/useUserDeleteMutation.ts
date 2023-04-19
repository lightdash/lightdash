import { ApiError } from '@lightdash/common';
import { useMutation } from 'react-query';
import { lightdashApi } from '../../api';

const deleteUserQuery = async () =>
    lightdashApi<undefined>({
        url: `/user/me`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteUserMutation = () =>
    useMutation<undefined, ApiError, undefined>(deleteUserQuery, {
        mutationKey: ['user_delete'],
    });
