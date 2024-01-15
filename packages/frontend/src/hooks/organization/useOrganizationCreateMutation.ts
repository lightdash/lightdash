import { ApiError, CreateOrganization } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const createOrgQuery = async (data: CreateOrganization) =>
    lightdashApi<null>({
        url: `/org`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useOrganizationCreateMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, CreateOrganization>(createOrgQuery, {
        mutationKey: ['organization_create'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
        },
    });
};
