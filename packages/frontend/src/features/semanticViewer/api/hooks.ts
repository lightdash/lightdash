import {
    type ApiError,
    type PivotChartData,
    type SemanticLayerClientInfo,
    type SemanticLayerField,
    type SemanticLayerQuery,
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
        PivotChartData,
        ApiError,
        SemanticLayerQuery
    >,
) =>
    useMutation<PivotChartData, ApiError, SemanticLayerQuery>({
        mutationFn: (query) =>
            apiGetSemanticLayerQueryResults({
                projectUuid,
                query,
            }),
        ...useMutationParams,
    });
