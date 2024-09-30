import {
    SchedulerJobStatus,
    type ApiJobScheduledResponse,
    type ApiSemanticLayerClientInfo,
    type ApiSemanticViewerChartCreate,
    type ApiSemanticViewerChartUpdate,
    type PivotChartData,
    type SavedSemanticViewerChart,
    type SemanticLayerField,
    type SemanticLayerJobStatusSuccessDetails,
    type SemanticLayerQuery,
    type SemanticLayerResultRow,
    type SemanticLayerView,
    type SemanticViewerChartCreate,
    type SemanticViewerChartUpdate,
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
    Pick<PivotChartData, 'results' | 'fileUrl'> &
        Pick<SemanticLayerJobStatusSuccessDetails, 'columns'>
> => {
    const { jobId } = await apiPostSemanticLayerRun({ projectUuid, query });
    const job = await getSemanticLayerCompleteJob(jobId);

    if (job.status === SchedulerJobStatus.COMPLETED) {
        const { fileUrl, columns } = job.details;

        const results = await getResultsFromStream<SemanticLayerResultRow>(
            fileUrl,
        );

        return {
            results,
            columns,
            fileUrl,
        };
    } else {
        throw job;
    }
};

type PostSemanticViewerChartCreateRequestParams = {
    projectUuid: string;
    payload: SemanticViewerChartCreate;
};

export const apiPostSemanticViewerChartCreate = ({
    projectUuid,
    payload,
}: PostSemanticViewerChartCreateRequestParams) =>
    lightdashApi<ApiSemanticViewerChartCreate['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/semantic-layer/saved`,
        method: 'POST',
        body: JSON.stringify(payload),
    });

type GetSavedSemanticViewerChartRequestParams = {
    projectUuid: string;
    findBy: { uuid?: string; slug?: string };
};

export const apiGetSavedSemanticViewerChart = async ({
    projectUuid,
    findBy: { uuid, slug },
}: GetSavedSemanticViewerChartRequestParams) => {
    if (!uuid && !slug) {
        throw new Error('uuid or slug is required');
    }

    const params = new URLSearchParams();
    if (uuid) params.append('uuid', uuid);
    if (slug) params.append('slug', slug);
    const paramsString = params.toString();

    return lightdashApi<SavedSemanticViewerChart>({
        version: 'v2',
        url: `/projects/${projectUuid}/semantic-layer/saved?${paramsString}`,
        method: 'GET',
        body: undefined,
    });
};

type GetSavedSemanticViewerChartResultsRequestParams = {
    projectUuid: string;
    findBy: { uuid?: string; slug?: string };
};

export const apiGetSavedSemanticViewerChartResults = async ({
    projectUuid,
    findBy: { uuid, slug },
}: GetSavedSemanticViewerChartResultsRequestParams) => {
    if (!uuid && !slug) {
        throw new Error('uuid or slug is required');
    }

    const params = new URLSearchParams();
    if (uuid) params.append('uuid', uuid);
    if (slug) params.append('slug', slug);
    const paramsString = params.toString();

    const scheduledJob = await lightdashApi<ApiJobScheduledResponse['results']>(
        {
            version: 'v2',
            url: `/projects/${projectUuid}/semantic-layer/saved/results-job?${paramsString}`,
            method: 'GET',
            body: undefined,
        },
    );
    const job = await getSemanticLayerCompleteJob(scheduledJob.jobId);

    if (job.status === SchedulerJobStatus.COMPLETED) {
        const { fileUrl, columns } = job.details;

        const results = await getResultsFromStream<SemanticLayerResultRow>(
            fileUrl,
        );

        return {
            results,
            columns,
        };
    } else {
        throw job;
    }
};

type PatchSavedSemanticViewerChartRequestParams = {
    projectUuid: string;
    uuid: string;
    payload: SemanticViewerChartUpdate;
};

export const apiPatchSavedSemanticViewerChart = ({
    projectUuid,
    uuid,
    payload,
}: PatchSavedSemanticViewerChartRequestParams) =>
    lightdashApi<ApiSemanticViewerChartUpdate['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/semantic-layer/saved/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(payload),
    });

type DeleteSavedSemanticViewerChartRequestParams = {
    projectUuid: string;
    uuid: string;
};

export const apiDeleteSavedSemanticViewerChart = ({
    projectUuid,
    uuid,
}: DeleteSavedSemanticViewerChartRequestParams) =>
    lightdashApi<undefined>({
        version: 'v2',
        url: `/projects/${projectUuid}/semantic-layer/saved/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });
