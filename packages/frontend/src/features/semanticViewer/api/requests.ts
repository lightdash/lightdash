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

// Makes sure the selectedFields object is in the correct format for the Query Params
function getQueryParamsReadyArrays(selectedFields: Record<string, string[]>) {
    const selectedFieldsEntries = Object.entries(selectedFields).reduce<
        string[][]
    >((acc, [key, value]) => {
        if (value.length > 0) {
            acc.push(...value.map((v) => [key, v]));
        }
        return acc;
    }, []);

    return selectedFieldsEntries;
}

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
    const selectedFieldsEntries = getQueryParamsReadyArrays(selectedFields);
    const queryParams = new URLSearchParams(selectedFieldsEntries);

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
