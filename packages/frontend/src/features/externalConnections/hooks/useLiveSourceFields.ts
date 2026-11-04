import {
    type ApiError,
    type LiveSourceFieldChange,
    type LiveSourceFields,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type LiveSourceParams = {
    projectUuid: string;
    connectionUuid: string;
};

const getFieldsUrl = ({ projectUuid, connectionUuid }: LiveSourceParams) =>
    `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/fields`;

const getFieldsQueryKey = ({ projectUuid, connectionUuid }: LiveSourceParams) =>
    ['live-source-fields', projectUuid, connectionUuid] as const;

/** Every field of a live data source, in use or available. */
export const useLiveSourceFields = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    return useQuery<LiveSourceFields, ApiError>({
        queryKey: getFieldsQueryKey(params),
        queryFn: () =>
            lightdashApi<LiveSourceFields>({
                url: getFieldsUrl(params),
                method: 'GET',
                body: undefined,
            }),
    });
};

const useApplyFields = (params: LiveSourceParams) => {
    const queryClient = useQueryClient();
    return async (fields: LiveSourceFields) => {
        queryClient.setQueryData(getFieldsQueryKey(params), fields);
        // Explores were rebuilt, so the explorer and agents see the new fields
        await queryClient.invalidateQueries({ queryKey: ['tables'] });
    };
};

export const useUpdateLiveSourceFields = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const applyFields = useApplyFields(params);
    const { showToastApiError } = useToaster();
    return useMutation<LiveSourceFields, ApiError, LiveSourceFieldChange[]>({
        mutationFn: (changes) =>
            lightdashApi<LiveSourceFields>({
                url: getFieldsUrl(params),
                method: 'PATCH',
                body: JSON.stringify({ changes }),
            }),
        onSuccess: applyFields,
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update fields',
                apiError: error,
            });
        },
    });
};

const refreshFields = async (
    lightdashApi: LightdashApi,
    params: LiveSourceParams,
) => {
    await lightdashApi<undefined>({
        url: `/ee/projects/${params.projectUuid}/external-connections/${params.connectionUuid}/refresh-explores`,
        method: 'POST',
        body: undefined,
    });
    return lightdashApi<LiveSourceFields>({
        url: getFieldsUrl(params),
        method: 'GET',
        body: undefined,
    });
};

/** Scans the integration again for fields it added since the last scan. */
export const useRefreshLiveSourceFields = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const applyFields = useApplyFields(params);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<LiveSourceFields, ApiError>({
        mutationFn: () => refreshFields(lightdashApi, params),
        onSuccess: async (fields) => {
            await applyFields(fields);
            showToastSuccess({ title: 'Fields refreshed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to refresh fields',
                apiError: error,
            });
        },
    });
};
