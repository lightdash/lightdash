import {
    type ApiError,
    type ApiGetNotifications,
    type ApiNotificationResourceType,
    type ApiNotificationUpdateParams,
    type ApiSuccessEmpty,
    type Notification,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getNotifications = async (type: ApiNotificationResourceType) =>
    lightdashApi<ApiGetNotifications['results']>({
        url: `/notifications?type=${type}`,
        method: 'GET',
        body: undefined,
    });

export const useGetNotifications = (
    type: ApiNotificationResourceType,
    enabled: boolean,
) =>
    useQuery<ApiGetNotifications['results'], ApiError>(
        ['notifications', type],
        () => getNotifications(type),
        {
            refetchInterval: 3 * 60 * 1000, // 3 minutes
            retry: (_, error) => error.error.statusCode !== 403,
            enabled,
        },
    );

const updateNotification = (
    notificationId: string,
    toUpdate: ApiNotificationUpdateParams,
) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/notifications/${notificationId}`,
        method: 'PATCH',
        body: JSON.stringify(toUpdate),
    });

export const useUpdateNotification = () => {
    const queryClient = useQueryClient();

    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { toUpdate: ApiNotificationUpdateParams } & Pick<
            Notification,
            'notificationId' | 'resourceType'
        >
    >(
        ({ notificationId, toUpdate }) =>
            updateNotification(notificationId, toUpdate),
        {
            mutationKey: ['update-notification'],
            onSuccess: async (_, { resourceType }) => {
                await queryClient.invalidateQueries([
                    'notifications',
                    resourceType,
                ]);

                // TODO: Invalidate dashboard comments query if after viewing a dashboard comment notification and on the current dashboard
            },
        },
    );
};
