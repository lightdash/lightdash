import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const leaveOrganizationQuery = async (lightdashApi: LightdashApi) =>
    lightdashApi<null>({
        url: `/user/me/leaveOrganization`,
        method: 'DELETE',
        body: undefined,
    });

export const useLeaveOrganizationMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useMutation<null, ApiError>(
        () => leaveOrganizationQuery(lightdashApi),
        {
            mutationKey: ['leave_organization'],
            onSuccess: () => {
                window.location.href = '/login';
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to leave organization',
                    apiError: error,
                });
            },
        },
    );
};
