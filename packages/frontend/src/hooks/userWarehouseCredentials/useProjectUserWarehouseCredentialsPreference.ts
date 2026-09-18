import {
    type ApiError,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getProjectUserWarehouseCredentialsPreference = async (
    projectUuid: string,
    connectionUuid: string,
) =>
    lightdashApi<UserWarehouseCredentials | null>({
        url: `/projects/${projectUuid}/user-credentials?connectionUuid=${encodeURIComponent(
            connectionUuid,
        )}`,
        method: 'GET',
        body: undefined,
    });

export const useProjectUserWarehouseCredentialsPreference = (
    projectUuid: string | undefined,
    connectionUuid: string | undefined,
) => {
    return useQuery<
        UserWarehouseCredentials | null,
        ApiError,
        UserWarehouseCredentials | undefined
    >({
        queryKey: [
            'project-user-warehouse-credentials-preference',
            projectUuid,
            connectionUuid,
        ],
        queryFn: () =>
            getProjectUserWarehouseCredentialsPreference(
                projectUuid!,
                connectionUuid!,
            ),
        enabled: !!projectUuid && !!connectionUuid,
        retry: false,
        select: (preference) => preference ?? undefined,
    });
};

const updateProjectUserWarehouseCredentialsPreference = async (
    projectUuid: string,
    userWarehouseCredentialsUuid: string,
    connectionUuid: string,
) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/user-credentials/${userWarehouseCredentialsUuid}?connectionUuid=${encodeURIComponent(
            connectionUuid,
        )}`,
        method: 'PATCH',
        body: undefined,
    });

type UpdateCredentialsPreference = {
    projectUuid: string;
    userWarehouseCredentialsUuid: string;
    connectionUuid: string;
};

export const useProjectUserWarehouseCredentialsPreferenceMutation = (
    options?: UseMutationOptions<null, ApiError, UpdateCredentialsPreference>,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, UpdateCredentialsPreference>(
        ({ projectUuid, userWarehouseCredentialsUuid, connectionUuid }) =>
            updateProjectUserWarehouseCredentialsPreference(
                projectUuid,
                userWarehouseCredentialsUuid,
                connectionUuid,
            ),
        {
            mutationKey: ['update-project-user-credentials-preference'],
            onSuccess: async (...args) => {
                await queryClient.invalidateQueries([
                    'project-user-warehouse-credentials-preference',
                ]);
                showToastSuccess({
                    title: 'Credentials preference saved successfully',
                });
                options?.onSuccess?.(...args);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to save credentials preference`,
                    apiError: error,
                });
            },
            ...options,
        },
    );
};
