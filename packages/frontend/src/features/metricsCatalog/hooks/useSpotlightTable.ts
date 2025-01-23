import {
    DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG,
    isApiError,
    type ApiError,
    type ApiGetSpotlightTableConfig,
    type ApiSuccessEmpty,
    type SpotlightTableConfig,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type UseSpotlightTableConfigOptions = {
    projectUuid: string | undefined;
};

const getSpotlightTableConfig = async ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    try {
        return await lightdashApi<ApiGetSpotlightTableConfig['results']>({
            url: `/projects/${projectUuid}/spotlight/table/config`,
            method: 'GET',
            body: undefined,
        });
    } catch (e) {
        if (isApiError(e) && e.error.statusCode === 404) {
            return {
                columnConfig: DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG,
            };
        }

        throw e;
    }
};

export const useSpotlightTableConfig = ({
    projectUuid,
}: UseSpotlightTableConfigOptions) => {
    return useQuery<ApiGetSpotlightTableConfig['results'], ApiError>({
        queryKey: ['spotlight-table-config', projectUuid],
        queryFn: () => getSpotlightTableConfig({ projectUuid: projectUuid! }),
        enabled: !!projectUuid,
    });
};

const createSpotlightTableConfig = async ({
    projectUuid,
    data,
}: {
    projectUuid: string;
    data: Pick<SpotlightTableConfig, 'columnConfig'>;
}) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/spotlight/table/config`,
        method: 'POST',
        body: JSON.stringify({
            columnConfig: data.columnConfig,
        }),
    });
};

export const useCreateSpotlightTableConfig = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        {
            projectUuid: string;
            data: Pick<SpotlightTableConfig, 'columnConfig'>;
        }
    >({
        mutationFn: ({ projectUuid, data }) =>
            createSpotlightTableConfig({ projectUuid, data }),
        onSuccess: (_, { projectUuid }) => {
            void queryClient.invalidateQueries({
                queryKey: ['spotlight-table-config', projectUuid],
            });
            showToastSuccess({
                title: 'Spotlight table config saved for everyone in this project',
            });
        },
        onError: () => {
            showToastError({
                title: 'Error saving spotlight table config',
            });
        },
    });
};

const resetSpotlightTableConfig = async ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/spotlight/table/config`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useResetSpotlightTableConfig = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        { projectUuid: string }
    >({
        mutationFn: ({ projectUuid }) =>
            resetSpotlightTableConfig({ projectUuid }),
        onSuccess: (_, { projectUuid }) => {
            void queryClient.invalidateQueries({
                queryKey: ['spotlight-table-config', projectUuid],
            });
        },
    });
};
