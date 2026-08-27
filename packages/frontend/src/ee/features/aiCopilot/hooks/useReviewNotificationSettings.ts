import {
    type AiReviewLinearDestination,
    type ApiAiReviewLinearDestinationResponse,
    type ApiAiReviewNotificationSettingsResponse,
    type ApiError,
    type UpdateAiReviewNotificationSettings,
    type UpdateAiReviewLinearDestination,
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
const LINEAR_DESTINATION_QUERY_KEY = ['ai-review-linear-destination'];

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

const getReviewLinearDestination = async (projectUuid: string) =>
    lightdashApi<ApiAiReviewLinearDestinationResponse['results']>({
        url: `/aiAgents/admin/review-linear-destination/${projectUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useReviewLinearDestination = (projectUuid: string | null) =>
    useQuery<AiReviewLinearDestination, ApiError>({
        queryKey: [...LINEAR_DESTINATION_QUERY_KEY, projectUuid],
        queryFn: () => getReviewLinearDestination(projectUuid!),
        enabled: !!projectUuid,
        keepPreviousData: false,
    });

const updateReviewLinearDestination = async (args: {
    projectUuid: string;
    data: UpdateAiReviewLinearDestination;
}) =>
    lightdashApi<AiReviewLinearDestination>({
        url: `/aiAgents/admin/review-linear-destination/${args.projectUuid}`,
        method: 'PUT',
        body: JSON.stringify(args.data),
    });

export const useUpdateReviewLinearDestination = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        AiReviewLinearDestination,
        ApiError,
        { projectUuid: string; data: UpdateAiReviewLinearDestination }
    >({
        mutationFn: updateReviewLinearDestination,
        onSuccess: async (destination) => {
            queryClient.setQueryData(
                [...LINEAR_DESTINATION_QUERY_KEY, destination.projectUuid],
                destination,
            );
            showToastSuccess({ title: 'Linear destination updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update Linear destination',
                apiError: error,
            });
        },
    });
};

const clearReviewLinearDestinations = async (): Promise<void> =>
    lightdashApi<undefined>({
        url: `/aiAgents/admin/review-linear-destinations`,
        method: 'DELETE',
        body: undefined,
    });

export const useClearReviewLinearDestinations = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<void, ApiError, void>({
        mutationFn: clearReviewLinearDestinations,
        onSuccess: async () => {
            await queryClient.invalidateQueries(LINEAR_DESTINATION_QUERY_KEY);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to clear old Linear destinations',
                apiError: error,
            });
        },
    });
};
