import {
    type ApiError,
    type SemanticLayerField,
    type SemanticLayerView,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import {
    apiGetSemanticLayerViewFields,
    apiGetSemanticLayerViews,
} from './requests';

type useGetSemanticLayerViewsParams = {
    projectUuid: string;
};

export const useGetSemanticLayerViews = ({
    projectUuid,
}: useGetSemanticLayerViewsParams) =>
    useQuery<SemanticLayerView[], ApiError>(
        ['semanticLayer', projectUuid, 'views'],
        () => apiGetSemanticLayerViews({ projectUuid }),
    );

type SemanticLayerViewFieldsParams = {
    projectUuid: string;
    view: string;
};

export const useGetSemanticLayerViewFields = ({
    projectUuid,
    view,
}: SemanticLayerViewFieldsParams) =>
    useQuery<SemanticLayerField[], ApiError>(
        ['semanticLayer', projectUuid, view, 'fields'],
        () => apiGetSemanticLayerViewFields({ projectUuid, view }),
    );
