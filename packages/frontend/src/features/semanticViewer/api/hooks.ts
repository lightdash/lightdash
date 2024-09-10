import {
    ChartKind,
    type ApiError,
    type ApiSemanticLayerCreateChart,
    type PivotChartData,
    type SavedSemanticLayer,
    type SemanticLayerClientInfo,
    type SemanticLayerCreateChart,
    type SemanticLayerField,
    type SemanticLayerJobStatusSuccessDetails,
    type SemanticLayerQuery,
    type SemanticLayerResultRow,
    type SemanticLayerView,
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
    createSemanticLayerChart,
    getSavedSemanticLayerChart,
    getSemanticLayerChartResults,
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
    projectUuid: string,
    useMutationParams?: UseMutationOptions<
        Pick<PivotChartData, 'results'> &
            Pick<SemanticLayerJobStatusSuccessDetails, 'columns'>,
        ApiError,
        SemanticLayerQuery
    >,
) =>
    useMutation<
        Pick<PivotChartData, 'results'> &
            Pick<SemanticLayerJobStatusSuccessDetails, 'columns'>,
        ApiError,
        SemanticLayerQuery
    >({
        mutationFn: (query) =>
            apiGetSemanticLayerQueryResults({
                projectUuid,
                query,
            }),
        ...useMutationParams,
    });

export const useCreateSemanticLayerChartMutation = (
    projectUuid: string,
    mutationOptions: UseMutationOptions<
        ApiSemanticLayerCreateChart['results'],
        ApiError,
        SemanticLayerCreateChart
    > = {},
) =>
    useMutation<
        ApiSemanticLayerCreateChart['results'],
        ApiError,
        SemanticLayerCreateChart
    >((data) => createSemanticLayerChart(projectUuid, data), {
        mutationKey: [projectUuid, 'semanticLayer', 'createChart'],
        ...mutationOptions,
    });

const getDashboardSemanticLayerChartAndPossibleResults = async ({
    projectUuid,
    savedSemanticLayerUuid,
}: {
    projectUuid: string;
    savedSemanticLayerUuid: string;
}): Promise<{
    resultsAndColumns: {
        results: SemanticLayerResultRow[];
        columns: string[];
    };
    chart: SavedSemanticLayer;
}> => {
    const chart = await getSavedSemanticLayerChart(
        projectUuid,
        savedSemanticLayerUuid,
    );

    const hasResultsHandledInChart = chart.config.type !== ChartKind.TABLE;

    if (hasResultsHandledInChart) {
        return {
            chart,
            resultsAndColumns: {
                results: [],
                columns: [],
            },
        };
    }

    const semanticLayerChartResults = await getSemanticLayerChartResults(
        projectUuid,
        chart.savedSemanticLayerUuid,
    );

    return {
        chart,
        resultsAndColumns: {
            results: semanticLayerChartResults.results,
            columns: semanticLayerChartResults.columns,
        },
    };
};

/**
 * Fetches the chart and possible results of a SemanticLayer query from the Semantic Layer runner - used in Dashboards
 * If the chart is not of type ChartKind.TABLE, we return empty results & columns
 * @param savedSemanticLayerUuid - The UUID of the saved SemanticLayer query.
 * @param projectUuid - The UUID of the project.
 * @returns The chart and results of the semantic layer query.
 */
export const useDashboardSemanticLayerChart = (
    projectUuid: string,
    savedSemanticLayerUuid: string | null,
) => {
    return useQuery<
        {
            resultsAndColumns: {
                results: SemanticLayerResultRow[];
                columns: string[];
            };
            chart: SavedSemanticLayer;
        },
        ApiError & { slug?: string }
    >(
        [projectUuid, 'semanticLayer', 'chart', savedSemanticLayerUuid],
        () => {
            return getDashboardSemanticLayerChartAndPossibleResults({
                projectUuid,
                savedSemanticLayerUuid: savedSemanticLayerUuid!,
            });
        },
        {
            enabled: Boolean(savedSemanticLayerUuid) && Boolean(projectUuid),
        },
    );
};
