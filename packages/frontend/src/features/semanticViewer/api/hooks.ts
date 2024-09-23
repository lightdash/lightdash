import {
    ChartKind,
    type ApiError,
    type ApiSemanticViewerCreateChart,
    type PivotChartData,
    type SavedSemanticViewerChart,
    type SemanticLayerClientInfo,
    type SemanticLayerField,
    type SemanticLayerJobStatusSuccessDetails,
    type SemanticLayerQuery,
    type SemanticLayerResultRow,
    type SemanticLayerView,
    type SemanticViewerCreateChart,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import {
    apiGetSemanticLayerInfo,
    apiGetSemanticLayerQueryResults,
    apiGetSemanticLayerViews,
    apiPostSemanticLayerSql,
    apiPostSemanticLayerViewFields,
    createSemanticViewerChart,
    getSavedSemanticViewerChart,
    getSavedSemanticViewerChartResults,
} from './requests';

type SemanticLayerInfoParams = {
    projectUuid: string;
    useQueryParams?: UseQueryOptions<SemanticLayerClientInfo, ApiError>;
};

export const useSemanticLayerInfo = ({
    projectUuid,
    useQueryParams,
}: SemanticLayerInfoParams) =>
    useQuery<SemanticLayerClientInfo, ApiError>({
        queryKey: [projectUuid, 'semanticLayer', 'info'],
        queryFn: () => apiGetSemanticLayerInfo({ projectUuid }),
        ...useQueryParams,
    });

type SemanticLayerViewsParams = {
    projectUuid: string;
};

export const useSemanticLayerViews = ({
    projectUuid,
}: SemanticLayerViewsParams) =>
    useQuery<SemanticLayerView[], ApiError>({
        queryKey: [projectUuid, 'semanticLayer', 'views'],
        queryFn: () => apiGetSemanticLayerViews({ projectUuid }),
    });

type SemanticLayerViewFieldsParams = {
    projectUuid: string;
    view: string;
    selectedFields: Pick<
        SemanticLayerQuery,
        'dimensions' | 'timeDimensions' | 'metrics'
    >;
};

export const useSemanticLayerViewFields = (
    { projectUuid, view, selectedFields }: SemanticLayerViewFieldsParams,
    useQueryParams?: UseQueryOptions<SemanticLayerField[], ApiError>,
) => {
    return useQuery<SemanticLayerField[], ApiError>({
        queryKey: [
            projectUuid,
            'semanticLayer',
            view,
            'fields',
            JSON.stringify(selectedFields),
        ],
        queryFn: () =>
            apiPostSemanticLayerViewFields({
                projectUuid,
                view,
                selectedFields,
            }),
        ...useQueryParams,
    });
};

type SemanticLayerSqlParams = {
    projectUuid: string;
    query: SemanticLayerQuery;
};

export const useSemanticLayerSql = (
    { projectUuid, query }: SemanticLayerSqlParams,
    useQueryParams?: UseQueryOptions<string, ApiError>,
) =>
    useQuery<string, ApiError>({
        queryKey: [projectUuid, 'semanticLayer', 'sql', JSON.stringify(query)],
        queryFn: () => apiPostSemanticLayerSql({ projectUuid, payload: query }),
        ...useQueryParams,
    });

export const useSemanticLayerQueryResults = (
    { projectUuid, query }: SemanticLayerSqlParams,
    useQueryParams?: UseQueryOptions<
        Pick<PivotChartData, 'results'> &
            Pick<SemanticLayerJobStatusSuccessDetails, 'columns'>,
        ApiError
    >,
) =>
    useQuery<
        Pick<PivotChartData, 'results'> &
            Pick<SemanticLayerJobStatusSuccessDetails, 'columns'>,
        ApiError
    >({
        ...useQueryParams,
        queryKey: [
            projectUuid,
            'semanticLayer',
            'query',
            query.sortBy,
            query.filters,
        ],
        queryFn: () =>
            apiGetSemanticLayerQueryResults({
                projectUuid,
                query,
            }),
    });

export const useCreateSemanticViewerChartMutation = (
    projectUuid: string,
    mutationOptions: UseMutationOptions<
        ApiSemanticViewerCreateChart['results'],
        ApiError,
        SemanticViewerCreateChart
    > = {},
) =>
    useMutation<
        ApiSemanticViewerCreateChart['results'],
        ApiError,
        SemanticViewerCreateChart
    >((data) => createSemanticViewerChart(projectUuid, data), {
        mutationKey: [projectUuid, 'semanticViewer', 'createChart'],
        ...mutationOptions,
    });

type SavedSemanticViewChartWithResultsAndColumns = {
    resultsAndColumns: {
        results: SemanticLayerResultRow[];
        columns: string[];
    };
    chart: SavedSemanticViewerChart;
};

/**
 * Fetches the semantic viewer chart and results for a saved chart.
 * @returns The chart and results of the semantic layer query.
 */
export const useSavedSemanticViewerChart = (
    {
        projectUuid,
        uuid,
    }: {
        projectUuid: string;
        uuid: string | null;
    },
    useQueryParams?: UseQueryOptions<
        SavedSemanticViewChartWithResultsAndColumns,
        ApiError & { slug?: string }
    >,
) => {
    return useQuery<
        SavedSemanticViewChartWithResultsAndColumns,
        ApiError & { slug?: string }
    >(
        [projectUuid, 'semanticLayer', 'chart', uuid],
        async () => {
            if (!uuid) {
                throw new Error('uuid is required');
            }

            const chart = await getSavedSemanticViewerChart(projectUuid, uuid);

            // If the chart is not a table, we don't need to fetch the results.
            if (chart.config.type !== ChartKind.TABLE) {
                return {
                    chart,
                    // TODO: this feels like a type hack
                    resultsAndColumns: {
                        results: [],
                        columns: [],
                    },
                };
            }

            const semanticViewerChartResults =
                await getSavedSemanticViewerChartResults(
                    projectUuid,
                    chart.savedSemanticViewerChartUuid,
                );

            return {
                chart,
                resultsAndColumns: {
                    results: semanticViewerChartResults.results,
                    columns: semanticViewerChartResults.columns,
                },
            };
        },
        {
            enabled: Boolean(uuid),
            ...useQueryParams,
        },
    );
};
