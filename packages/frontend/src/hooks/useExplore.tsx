import { type ApiError, type ApiExploreResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { getSemanticLayerDimensions } from '../api/MetricFlowAPI';
import {
    buildMetricFlowExplore,
    isMetricFlowExploreName,
} from '../features/metricFlow/utils/metricFlowExplore';
import useApp from '../providers/App/useApp';
import { useProjectUuid } from './useProjectUuid';
import useQueryError from './useQueryError';

const getExplore = async (projectUuid: string, exploreId: string) => {
    try {
        return await lightdashApi<ApiExploreResults>({
            url: `/projects/${projectUuid}/explores/${exploreId}`,
            method: 'GET',
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
};

const getMetricFlowExplore = async (
    projectUuid: string,
    exploreName: string,
): Promise<ApiExploreResults> => {
    const metricFlowFields = await getSemanticLayerDimensions(projectUuid, {});
    return buildMetricFlowExplore(exploreName, {
        dimensions: metricFlowFields.dimensions ?? [],
        metricsForDimensions: metricFlowFields.metricsForDimensions ?? [],
    });
};

export const useExplore = (
    activeTableName: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiExploreResults, ApiError>,
) => {
    const projectUuid = useProjectUuid();
    const { health } = useApp();
    const setErrorResponse = useQueryError();

    const queryKey = ['tables', activeTableName, projectUuid];
    const isMetricFlowExplore = isMetricFlowExploreName(activeTableName);
    return useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () =>
            isMetricFlowExplore
                ? getMetricFlowExplore(projectUuid!, activeTableName || '')
                : getExplore(projectUuid!, activeTableName || ''),
        enabled:
            !!activeTableName &&
            !!projectUuid &&
            (!isMetricFlowExplore || !!health.data?.hasDbtSemanticLayer),
        onError: (result) => setErrorResponse(result),
        retry: false,
        ...useQueryOptions,
    });
};
