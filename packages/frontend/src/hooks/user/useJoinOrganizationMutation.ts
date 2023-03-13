import {
    ApiError,
    CreateOrganization,
    UpdateOrganization,
} from '@lightdash/common';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const joinOrgQuery = async (orgUuid: string) =>
    lightdashApi<undefined>({
        url: `/user/me/joinOrganization/${orgUuid}`,
        method: 'POST',
        body: undefined,
    });

export const useJoinOrganizationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, string>(joinOrgQuery, {
        mutationKey: ['organisation_create'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
        },
    });
};
