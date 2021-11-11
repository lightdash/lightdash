import { ApiError, TablesConfiguration } from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';
import { useApp } from '../providers/AppProvider';

const getProjectTablesConfigurationQuery = async (projectUuid: string) =>
    lightdashApi<TablesConfiguration>({
        url: `/projects/${projectUuid}/tablesConfiguration`,
        method: 'GET',
        body: undefined,
    });

const updateProjectTablesConfigurationQuery = async (
    projectUuid: string,
    data: TablesConfiguration,
) =>
    lightdashApi<TablesConfiguration>({
        url: `/projects/${projectUuid}/tablesConfiguration`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useProjectTablesConfiguration = (projectUuid: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<TablesConfiguration, ApiError>({
        queryKey: ['tables_configuration_update', projectUuid],
        queryFn: () => getProjectTablesConfigurationQuery(projectUuid),
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateProjectTablesConfiguration = (projectUuid: string) => {
    const { showToastSuccess, showToastError } = useApp();
    const queryClient = useQueryClient();
    return useMutation<TablesConfiguration, ApiError, TablesConfiguration>(
        (data) => updateProjectTablesConfigurationQuery(projectUuid, data),
        {
            mutationKey: ['tables_configuration_update'],
            onSuccess: async (data) => {
                queryClient.setQueryData(
                    ['tables_configuration_update', projectUuid],
                    data,
                );
                showToastSuccess({
                    title: `Success! Tables configuration saved with success.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to save tables configuration`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
