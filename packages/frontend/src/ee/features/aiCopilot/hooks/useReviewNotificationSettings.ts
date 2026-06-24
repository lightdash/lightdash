import {
    type ApiAiReviewNotificationSettingsResponse,
    type ApiError,
    type UpdateAiReviewNotificationSettings,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

type Settings = ApiAiReviewNotificationSettingsResponse['results'];

const QUERY_KEY = ['ai-review-notification-settings'];

const getReviewNotificationSettings = async () =>
    lightdashApi<Settings>({
        url: `/aiAgents/admin/review-notification-settings`,
        method: 'GET',
        body: undefined,
    });

export const useReviewNotificationSettings = (
    queryOptions?: UseQueryOptions<Settings, ApiError>,
) =>
    useQuery<Settings, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: getReviewNotificationSettings,
        keepPreviousData: true,
        ...queryOptions,
    });

const updateReviewNotificationSettings = async (
    data: UpdateAiReviewNotificationSettings,
) =>
    lightdashApi<Settings>({
        url: `/aiAgents/admin/review-notification-settings`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateReviewNotificationSettings = (
    mutationOptions?: UseMutationOptions<
        Settings,
        ApiError,
        UpdateAiReviewNotificationSettings
    >,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<Settings, ApiError, UpdateAiReviewNotificationSettings>({
        mutationFn: updateReviewNotificationSettings,
        onSuccess: async (data, variables, context) => {
            showToastSuccess({
                title: 'Success! Review notification settings updated',
            });
            queryClient.setQueryData<Settings | undefined>(
                QUERY_KEY,
                (previous) => (previous ? { ...previous, ...data } : data),
            );
            await queryClient.invalidateQueries(QUERY_KEY);
            mutationOptions?.onSuccess?.(data, variables, context);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update review notification settings',
                apiError: error,
            });
        },
    });
};
