import {
    isApiSqlRunnerJobPivotQuerySuccessResponse,
    isErrorDetails,
    type ApiJobScheduledResponse,
    type ApiSemanticLayerClientInfo,
    type PivotChartData,
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
}: PostSemanticLayerQueryRequestParams): Promise<PivotChartData> => {
    const { jobId } = await apiPostSemanticLayerRun({ projectUuid, query });
    const job = await getSqlRunnerCompleteJob(jobId);

    // TODO: either move types into common or create a new type for this
    if (isApiSqlRunnerJobPivotQuerySuccessResponse(job)) {
        const url =
            job.details && !isErrorDetails(job.details)
                ? job.details.fileUrl
                : undefined;
        const results = await getResultsFromStream<SemanticLayerResultRow>(url);

        return {
            results,
            indexColumn: job.details.indexColumn,
            valuesColumns: job.details.valuesColumns,
            columns: job.details.columns,
        };
    } else {
        throw job;
    }
};
