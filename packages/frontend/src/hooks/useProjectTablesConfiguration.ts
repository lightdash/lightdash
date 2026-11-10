import { type ApiError, type TablesConfiguration } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getProjectTablesConfigurationQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<TablesConfiguration>({
        url: `/projects/${projectUuid}/tablesConfiguration`,
        method: 'GET',
        body: undefined,
    });

const updateProjectTablesConfigurationQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: TablesConfiguration,
) =>
    lightdashApi<TablesConfiguration>({
        url: `/projects/${projectUuid}/tablesConfiguration`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useProjectTablesConfiguration = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    return useQuery<TablesConfiguration, ApiError>({
        queryKey: ['tables_configuration_update', projectUuid],
        queryFn: () =>
            getProjectTablesConfigurationQuery(lightdashApi, projectUuid),
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateProjectTablesConfiguration = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<TablesConfiguration, ApiError, TablesConfiguration>(
        (data) =>
            updateProjectTablesConfigurationQuery(
                lightdashApi,
                projectUuid,
                data,
            ),
        {
            mutationKey: ['tables_configuration_update', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries(['tables']);
                queryClient.setQueryData(
                    ['tables_configuration_update', projectUuid],
                    data,
                );
                showToastSuccess({
                    title: `Saved project configuration`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to save tables configuration`,
                    apiError: error,
                });
            },
        },
    );
};
