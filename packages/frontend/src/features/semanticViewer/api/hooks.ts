import {
    type ApiError,
    type SemanticLayerField,
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
    apiGetSemanticLayerQueryResults,
    apiGetSemanticLayerViews,
    apiPostSemanticLayerSql,
    apiPostSemanticLayerViewFields,
} from './requests';

type useGetSemanticLayerViewsParams = {
    projectUuid: string;
};

export const useSemanticLayerViews = ({
    projectUuid,
}: useGetSemanticLayerViewsParams) =>
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
    payload: SemanticLayerQuery;
};

export const useSemanticLayerSql = (
    { projectUuid, payload }: SemanticLayerSqlParams,
    useQueryParams?: UseQueryOptions<string, ApiError>,
) =>
    useQuery<string, ApiError>({
        queryKey: [
            projectUuid,
            'semanticLayer',
            'sql',
            JSON.stringify(payload),
        ],
        queryFn: () => apiPostSemanticLayerSql({ projectUuid, payload }),
        ...useQueryParams,
    });

export const useSemanticLayerQueryResults = (
    projectUuid: string,
    useMutationParams?: UseMutationOptions<
        SemanticLayerResultRow[],
        ApiError,
        SemanticLayerQuery
    >,
) =>
    useMutation<SemanticLayerResultRow[], ApiError, SemanticLayerQuery>({
        mutationFn: (query) =>
            apiGetSemanticLayerQueryResults({
                projectUuid,
                query,
            }),
        ...useMutationParams,
    });
