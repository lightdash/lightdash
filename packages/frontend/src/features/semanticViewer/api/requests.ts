import {
    type ApiJobScheduledResponse,
    type SemanticLayerField,
    type SemanticLayerQuery,
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

type PostSemanticLayerViewFieldsRequestParams = {
    projectUuid: string;
    view: string;
    selectedFields: Pick<
        SemanticLayerQuery,
        'dimensions' | 'timeDimensions' | 'metrics'
    >;
};

export const apiPostSemanticLayerViewFields = ({
    projectUuid,
    view,
    selectedFields,
}: PostSemanticLayerViewFieldsRequestParams) => {
    return lightdashApi<SemanticLayerField[]>({
        version: 'v2',
        method: 'POST',
        url: `/projects/${projectUuid}/semantic-layer/views/${view}/query-fields`,
        body: JSON.stringify(selectedFields),
    });
};

type PostSemanticLayerSqlRequestParams = {
    projectUuid: string;
    payload: SemanticLayerQuery;
};

export const apiPostSemanticLayerSql = ({
    projectUuid,
    payload,
}: PostSemanticLayerSqlRequestParams) =>
    lightdashApi<string>({
        version: 'v2',
        method: 'POST',
        url: `/projects/${projectUuid}/semantic-layer/sql`,
        body: JSON.stringify(payload),
    });

type PostSemanticLayerQueryRequestParams = {
    projectUuid: string;
    query: SemanticLayerQuery;
};

export const apiPostSemanticLayerRun = ({
    projectUuid,
    query,
}: PostSemanticLayerQueryRequestParams) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        version: 'v2',
        method: 'POST',
        url: `/projects/${projectUuid}/semantic-layer/run`,
        body: JSON.stringify(query),
    });
