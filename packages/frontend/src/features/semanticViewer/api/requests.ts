import {
    isApiSemanticLayerJobSuccessResponse,
    isSemanticLayerJobErrorDetails,
    type ApiJobScheduledResponse,
    type ApiSemanticLayerClientInfo,
    type ApiSemanticLayerCreateChart,
    type PivotChartData,
    type SavedSemanticViewerChart,
    type SemanticLayerCreateChart,
    type SemanticLayerField,
    type SemanticLayerJobStatusSuccessDetails,
    type SemanticLayerQuery,
    type SemanticLayerResultRow,
    type SemanticLayerView,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { getResultsFromStream } from '../../../utils/request';
import { getSemanticLayerCompleteJob } from './requestUtils';

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
}: PostSemanticLayerQueryRequestParams): Promise<
    Pick<PivotChartData, 'results'> &
        Pick<SemanticLayerJobStatusSuccessDetails, 'columns'>
> => {
    const { jobId } = await apiPostSemanticLayerRun({ projectUuid, query });
    const job = await getSemanticLayerCompleteJob(jobId);

    if (isApiSemanticLayerJobSuccessResponse(job)) {
        const url =
            job.details && !isSemanticLayerJobErrorDetails(job.details)
                ? job.details.fileUrl
                : undefined;
        const results = await getResultsFromStream<SemanticLayerResultRow>(url);

        return {
            results,
            columns: job.details.columns,
        };
    } else {
        throw job;
    }
};

export const createSemanticViewerChart = (
    projectUuid: string,
    payload: SemanticLayerCreateChart,
) =>
    lightdashApi<ApiSemanticLayerCreateChart['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/semantic-layer/saved`,
        method: 'POST',
        body: JSON.stringify(payload),
    });

export const getSavedSemanticViewerChart = async (
    projectUuid: string,
    uuid: string,
) =>
    lightdashApi<SavedSemanticViewerChart>({
        version: 'v2',
        url: `/projects/${projectUuid}/semantic-layer/saved/${uuid}`,
        method: 'GET',
        body: undefined,
    });

export const getSemanticViewerChartResults = async (
    projectUuid: string,
    uuid: string,
) => {
    const scheduledJob = await lightdashApi<ApiJobScheduledResponse['results']>(
        {
            version: 'v2',
            url: `/projects/${projectUuid}/semantic-layer/saved/${uuid}/results-job`,
            method: 'GET',
            body: undefined,
        },
    );
    const job = await getSemanticLayerCompleteJob(scheduledJob.jobId);

    if (isApiSemanticLayerJobSuccessResponse(job)) {
        const url =
            job.details && !isSemanticLayerJobErrorDetails(job.details)
                ? job.details.fileUrl
                : undefined;
        const results = await getResultsFromStream<SemanticLayerResultRow>(url);

        return {
            results,
            columns: job.details.columns,
        };
    } else {
        throw job;
    }
};
