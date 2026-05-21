import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const leaveOrganizationQuery = async () =>
    lightdashApi<null>({
        url: `/user/me/leaveOrganization`,
        method: 'DELETE',
        body: undefined,
    });

export const useLeaveOrganizationMutation = () => {
    const { showToastApiError } = useToaster();
    return useMutation<null, ApiError>(leaveOrganizationQuery, {
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
    });
};
