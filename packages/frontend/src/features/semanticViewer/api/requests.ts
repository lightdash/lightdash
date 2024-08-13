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

type GetSemanticLayerViewFieldsRequestParams = {
    projectUuid: string;
    view: string;
    selectedFields: Pick<
        SemanticLayerQuery,
        'dimensions' | 'timeDimensions' | 'metrics'
    >;
};

export const apiGetSemanticLayerViewFields = ({
    projectUuid,
    view,
    selectedFields,
}: GetSemanticLayerViewFieldsRequestParams) => {
    const queryParams = new URLSearchParams();

    selectedFields.dimensions.forEach((dim, index) => {
        queryParams.append(`dimensions[${index}][name]`, dim.name);
    });

    selectedFields.timeDimensions.forEach((timeDim, index) => {
        queryParams.append(`timeDimensions[${index}][name]`, timeDim.name);
        if (timeDim.granularity) {
            queryParams.append(
                `timeDimensions[${index}][granularity]`,
                timeDim.granularity,
            );
        }
    });

    selectedFields.metrics.forEach((metric, index) => {
        queryParams.append(`metrics[${index}][name]`, metric.name);
    });

    return lightdashApi<SemanticLayerField[]>({
        version: 'v2',
        method: 'GET',
        url: `/projects/${projectUuid}/semantic-layer/views/${view}/fields${
            queryParams ? `?${queryParams}` : ''
        }`,
        body: undefined,
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
