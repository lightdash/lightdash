import {
    ExploreType,
    type ApiError,
    type ApiExploreResults,
    type ApiExploresResults,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type LiveSourceParams = {
    projectUuid: string;
    connectionUuid: string;
};

const getLiveSourceExplores = async (
    lightdashApi: LightdashApi,
    { projectUuid, connectionUuid }: LiveSourceParams,
): Promise<ApiExploreResults[]> => {
    const summaries = await lightdashApi<ApiExploresResults>({
        url: `/projects/${projectUuid}/explores?filtered=false`,
        method: 'GET',
        body: undefined,
    });
    const explores = await Promise.all(
        summaries
            .filter(({ type }) => type === ExploreType.API_SOURCE)
            .map(({ name }) =>
                lightdashApi<ApiExploreResults>({
                    url: `/projects/${projectUuid}/explores/${name}`,
                    method: 'GET',
                    body: undefined,
                }),
            ),
    );
    return explores.filter(
        (explore) => explore.apiSource?.connectionUuid === connectionUuid,
    );
};

/** The explores a live data source answers metric queries with. */
export const useLiveSourceExplores = (params: LiveSourceParams | null) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiExploreResults[], ApiError>({
        // Under 'tables' so anything that refreshes explores refreshes these
        queryKey: [
            'tables',
            'live-source',
            params?.projectUuid,
            params?.connectionUuid,
        ],
        queryFn: () => getLiveSourceExplores(lightdashApi, params!),
        enabled: params !== null,
    });
};

const refreshLiveSourceExplores = async (
    lightdashApi: LightdashApi,
    { projectUuid, connectionUuid }: LiveSourceParams,
) =>
    lightdashApi<undefined>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/refresh-explores`,
        method: 'POST',
        body: undefined,
    });

/** Rebuilds a live data source's explores from its integration's current fields. */
export const useRefreshLiveSourceExplores = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, LiveSourceParams>({
        mutationFn: (args) => refreshLiveSourceExplores(lightdashApi, args),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['tables'] });
            showToastSuccess({ title: 'Semantic layer refreshed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to refresh the semantic layer',
                apiError: error,
            });
        },
    });
};
