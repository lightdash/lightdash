import {
    type SemanticLayerField,
    type SemanticLayerView,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';

type GetSemanticLayerViewsRequestParams = {
    projectUuid: string;
};

export const apiGetSemanticLayerViews = ({
    projectUuid,
}: GetSemanticLayerViewsRequestParams) =>
    lightdashApi<SemanticLayerView[]>({
        version: 'v2',
        method: 'GET',
        url: `/projects/${projectUuid}/semantic-layer/views`,
        body: undefined,
    });

export const apiGetSemanticLayerViewFields = ({
    projectUuid,
    view,
}: {
    projectUuid: string;
    view: string;
}) =>
    lightdashApi<SemanticLayerField[]>({
        version: 'v2',
        method: 'GET',
        url: `/projects/${projectUuid}/semantic-layer/views/${view}/fields`,
        body: undefined,
    });
