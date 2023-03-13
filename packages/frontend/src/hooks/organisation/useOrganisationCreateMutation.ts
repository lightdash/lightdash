import {
    ApiError,
    CreateOrganization,
    UpdateOrganization,
} from '@lightdash/common';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const createOrgQuery = async (data: CreateOrganization) =>
    lightdashApi<undefined>({
        url: `/org`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useOrganisationCreateMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, CreateOrganization>(
        createOrgQuery,
        {
            mutationKey: ['organisation_create'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user']);
            },
        },
    );
};
