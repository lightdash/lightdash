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
) =>
    lightdashApi<UserWarehouseCredentials>({
        url: `/projects/${projectUuid}/user-credentials`,
        method: 'GET',
        body: undefined,
    });

export const useProjectUserWarehouseCredentialsPreference = (
    projectUuid: string | undefined,
) => {
    return useQuery<UserWarehouseCredentials, ApiError>({
        queryKey: [
            'project-user-warehouse-credentials-preference',
            projectUuid,
        ],
        queryFn: () =>
            getProjectUserWarehouseCredentialsPreference(projectUuid!),
        enabled: projectUuid !== undefined,
        retry: false,
    });
};

const updateProjectUserWarehouseCredentialsPreference = async (
    projectUuid: string,
    userWarehouseCredentialsUuid: string,
) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/user-credentials/${userWarehouseCredentialsUuid}`,
        method: 'PATCH',
        body: undefined,
    });

type UpdateCredentialsPreference = {
    projectUuid: string;
    userWarehouseCredentialsUuid: string;
};

export const useProjectUserWarehouseCredentialsPreferenceMutation = (
    options?: UseMutationOptions<null, ApiError, UpdateCredentialsPreference>,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, UpdateCredentialsPreference>(
        ({ projectUuid, userWarehouseCredentialsUuid }) =>
            updateProjectUserWarehouseCredentialsPreference(
                projectUuid,
                userWarehouseCredentialsUuid,
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
