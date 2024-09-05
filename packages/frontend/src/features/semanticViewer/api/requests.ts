import {
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiJobScheduledResponse,
    type ApiSemanticLayerClientInfo,
    type SemanticLayerColumnMapping,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type SemanticLayerResultRow,
    type SemanticLayerView,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import {
    getResultsFromStream,
    getSqlRunnerCompleteJob,
} from '../../../utils/requestUtils';

type GetSemanticLayerInfoRequestParams = {
    projectUuid: string;
};

export const apiGetSemanticLayerInfo = ({
    projectUuid,
}: GetSemanticLayerInfoRequestParams) =>
    lightdashApi<ApiSemanticLayerClientInfo['results']>({
        version: 'v2',
        method: 'GET',
        url: `/projects/${projectUuid}/semantic-layer`,
        body: undefined,
    });

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
    selectedFields: {
        dimensions: Pick<SemanticLayerField, 'name'>[];
        timeDimensions: Pick<SemanticLayerField, 'name'>[];
        metrics: Pick<SemanticLayerField, 'name'>[];
    };
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

const apiPostSemanticLayerRun = ({
    projectUuid,
    query,
}: PostSemanticLayerQueryRequestParams) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        version: 'v2',
        method: 'POST',
        url: `/projects/${projectUuid}/semantic-layer/run`,
        body: JSON.stringify(query),
    });

export const apiGetSemanticLayerQueryResults = async ({
    projectUuid,
    query,
}: PostSemanticLayerQueryRequestParams) => {
    const { jobId } = await apiPostSemanticLayerRun({ projectUuid, query });
    const job = await getSqlRunnerCompleteJob(jobId);
    const url =
        isApiSqlRunnerJobSuccessResponse(job) &&
        job?.details &&
        !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;

    return getResultsFromStream<SemanticLayerResultRow>(url);
};

export const apiGetSemanticLayerColumnMappings = ({
    projectUuid,
    query,
}: PostSemanticLayerQueryRequestParams) =>
    lightdashApi<SemanticLayerColumnMapping[]>({
        version: 'v2',
        method: 'POST',
        url: `/projects/${projectUuid}/semantic-layer/column-mappings`,
        body: JSON.stringify(query),
    });
