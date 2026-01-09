import { type ApiError, type ApiExploresResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { getSemanticLayerDimensions } from '../api/MetricFlowAPI';
import { buildMetricFlowExploreSummaries } from '../features/metricFlow/utils/metricFlowExplore';
import useApp from '../providers/App/useApp';
import useQueryError from './useQueryError';

const getExplores = async (projectUuid: string, filtered?: boolean) =>
    lightdashApi<ApiExploresResults>({
        url: `/projects/${projectUuid}/explores?filtered=${
            filtered ? 'true' : 'false'
        }`,
        method: 'GET',
        body: undefined,
    });

export const useExplores = (
    projectUuid: string | undefined,
    filtered?: boolean,
    useQueryFetchOptions?: UseQueryOptions<ApiExploresResults, ApiError>,
) => {
    const { health } = useApp();
    const setErrorResponse = useQueryError();
    const hasSemanticLayer = !!health.data?.hasDbtSemanticLayer;
    const queryKey = [
        'tables',
        projectUuid,
        filtered ? 'filtered' : 'all',
        hasSemanticLayer,
    ];
    return useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: async () => {
            if (!hasSemanticLayer) {
                return getExplores(projectUuid!, filtered);
            }
            try {
                const metricFlowFields = await getSemanticLayerDimensions(
                    projectUuid!,
                    {},
                );
                const metricFlowExplores = buildMetricFlowExploreSummaries({
                    dimensions: metricFlowFields.dimensions ?? [],
                    metricsForDimensions:
                        metricFlowFields.metricsForDimensions ?? [],
                });
                return metricFlowExplores;
            } catch (error) {
                console.warn('Failed to load semantic layer explores', error);
                return [];
            }
        },
        onError: (result) => setErrorResponse(result),
        retry: false,
        enabled: !!projectUuid,
        ...useQueryFetchOptions,
    });
};
