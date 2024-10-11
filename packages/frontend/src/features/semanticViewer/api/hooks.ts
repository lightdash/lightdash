import {
    fieldsInUseFromSemanticLayerQuery,
    type ApiError,
    type ApiSemanticViewerChartCreate,
    type ApiSemanticViewerChartUpdate,
    type PivotChartData,
    type SavedSemanticViewerChart,
    type SavedSemanticViewerChartResults,
    type SemanticLayerClientInfo,
    type SemanticLayerField,
    type SemanticLayerJobStatusSuccessDetails,
    type SemanticLayerQuery,
    type SemanticLayerView,
    type SemanticViewerChartCreate,
    type SemanticViewerChartUpdate,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import {
    apiDeleteSavedSemanticViewerChart,
    apiGetSavedSemanticViewerChart,
    apiGetSavedSemanticViewerChartResults,
    apiGetSemanticLayerInfo,
    apiGetSemanticLayerQueryResults,
    apiGetSemanticLayerViews,
    apiPatchSavedSemanticViewerChart,
    apiPostSemanticLayerSql,
    apiPostSemanticLayerViewFields,
    apiPostSemanticViewerChartCreate,
} from './requests';

type SemanticLayerInfoParams = {
    projectUuid: string;
};

export const useSemanticLayerInfo = (
    { projectUuid }: SemanticLayerInfoParams,
    useQueryParams?: UseQueryOptions<SemanticLayerClientInfo | null, ApiError>,
) =>
    useQuery<SemanticLayerClientInfo | null, ApiError>({
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
    semanticLayerView: string | undefined;
    semanticLayerQuery:
        | Pick<
              SemanticLayerQuery,
              'dimensions' | 'timeDimensions' | 'metrics' | 'filters'
          >
        | undefined;
};

export const useSemanticLayerViewFields = (
    {
        projectUuid,
        semanticLayerView,
        semanticLayerQuery,
    }: SemanticLayerViewFieldsParams,
    useQueryParams?: UseQueryOptions<SemanticLayerField[], ApiError>,
) => {
    const allFieldsInUse =
        semanticLayerQuery &&
        fieldsInUseFromSemanticLayerQuery(semanticLayerQuery);

    return useQuery<SemanticLayerField[], ApiError>({
        queryKey: [
            projectUuid,
            'semanticLayer',
            semanticLayerView,
            'fields',
            allFieldsInUse,
        ],
        queryFn: () => {
            if (!semanticLayerView) {
                throw new Error('semanticLayerView is required');
            }

            if (!allFieldsInUse) {
                throw new Error('semanticLayerQuery is required');
            }

            return apiPostSemanticLayerViewFields({
                projectUuid,
                view: semanticLayerView,
                selectedFields: allFieldsInUse,
            });
        },
        ...useQueryParams,
        enabled:
            (useQueryParams?.enabled ?? true) &&
            !!semanticLayerView &&
            !!allFieldsInUse,
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
        ApiSemanticViewerChartCreate['results'],
        ApiError,
        SemanticViewerChartCreate
    > = {},
) =>
    useMutation<
        ApiSemanticViewerChartCreate['results'],
        ApiError,
        SemanticViewerChartCreate
    >((payload) => apiPostSemanticViewerChartCreate({ projectUuid, payload }), {
        mutationKey: [projectUuid, 'semanticViewer', 'createChart'],
        ...mutationOptions,
    });

export const useSavedSemanticViewerChart = (
    {
        projectUuid,
        findBy: { uuid, slug },
    }: {
        projectUuid: string;
        findBy: { uuid?: string; slug?: string };
    },
    useQueryParams?: UseQueryOptions<
        SavedSemanticViewerChart,
        ApiError & { slug?: string }
    >,
) => {
    return useQuery<SavedSemanticViewerChart, ApiError & { slug?: string }>(
        [projectUuid, 'semanticLayer', 'chart', uuid ?? slug],
        () => {
            if (!uuid && !slug) {
                throw new Error('uuid or slug is required');
            }

            return apiGetSavedSemanticViewerChart({
                projectUuid,
                findBy: { uuid, slug },
            });
        },
        {
            enabled: !!uuid || !!slug,
            ...useQueryParams,
        },
    );
};

/**
 * Fetches results for a saved semantic viewer chart.
 * @returns The results of the semantic layer query.
 */
export const useSavedSemanticViewerChartResults = (
    {
        projectUuid,
        findBy: { uuid, slug },
    }: {
        projectUuid: string;
        findBy: { uuid?: string; slug?: string };
    },
    useQueryParams?: UseQueryOptions<
        SavedSemanticViewerChartResults,
        ApiError & { slug?: string }
    >,
) => {
    return useQuery<
        SavedSemanticViewerChartResults,
        ApiError & { slug?: string }
    >(
        [projectUuid, 'semanticLayer', 'results', uuid ?? slug],
        async () => {
            if (!uuid && !slug) {
                throw new Error('uuid or slug is required');
            }

            const results = await apiGetSavedSemanticViewerChartResults({
                projectUuid,
                findBy: { uuid, slug },
            });

            return results;
        },
        {
            enabled: !!uuid || !!slug,
            ...useQueryParams,
        },
    );
};

export const useSavedSemanticViewerChartUpdateMutation = (
    { projectUuid }: { projectUuid: string },
    mutationOptions: UseMutationOptions<
        ApiSemanticViewerChartUpdate['results'],
        ApiError,
        { uuid: string; payload: SemanticViewerChartUpdate }
    > = {},
) =>
    useMutation<
        ApiSemanticViewerChartUpdate['results'],
        ApiError,
        { uuid: string; payload: SemanticViewerChartUpdate }
    >(
        ({ uuid, payload }) =>
            apiPatchSavedSemanticViewerChart({ projectUuid, uuid, payload }),
        {
            mutationKey: [projectUuid, 'semanticViewer', 'updateChart'],
            ...mutationOptions,
        },
    );

export const useSavedSemanticViewerChartDeleteMutation = (
    { projectUuid, uuid }: { projectUuid: string; uuid: string },
    mutationOptions: UseMutationOptions<void, ApiError> = {},
) =>
    useMutation<void, ApiError>(
        () => apiDeleteSavedSemanticViewerChart({ projectUuid, uuid }),
        {
            mutationKey: [projectUuid, 'semanticViewer', uuid, 'deleteChart'],
            ...mutationOptions,
        },
    );
