import {
    SchedulerJobStatus,
    type ApiJobScheduledResponse,
    type ApiSqlRunnerJobStatusResponse,
    type SemanticLayerField,
    type SemanticLayerQuery,
    type SemanticLayerResultRow,
    type SemanticLayerView,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

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

// TODO: use generators to stream the results
export const apiGetSemanticLayerQueryResults = async ({
    projectUuid,
    query,
}: PostSemanticLayerQueryRequestParams) => {
    const { jobId } = await apiPostSemanticLayerRun({ projectUuid, query });
    let currentStatus: SchedulerJobStatus = SchedulerJobStatus.SCHEDULED;

    // start polling
    while (
        [SchedulerJobStatus.STARTED, SchedulerJobStatus.SCHEDULED].includes(
            currentStatus,
        )
    ) {
        const jobResult = await getSchedulerJobStatus<
            ApiSqlRunnerJobStatusResponse['results']
        >(jobId);

        currentStatus = jobResult.status;

        if (
            currentStatus === SchedulerJobStatus.COMPLETED &&
            'fileUrl' in jobResult.details
        ) {
            const response = await fetch(jobResult.details.fileUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
            });
            const rb = response.body;
            const reader = rb?.getReader();

            const stream = new ReadableStream({
                start(controller) {
                    function push() {
                        void reader?.read().then(({ done, value }) => {
                            if (done) {
                                // Close the stream
                                controller.close();
                                return;
                            }
                            // Enqueue the next data chunk into our target stream
                            controller.enqueue(value);

                            push();
                        });
                    }

                    push();
                },
            });

            const responseStream = new Response(stream, {
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await responseStream.text();

            // Split the JSON strings by newline
            const jsonStrings = result.trim().split('\n');
            const jsonObjects: SemanticLayerResultRow[] = jsonStrings
                .map((jsonString) => {
                    try {
                        if (!jsonString) {
                            return {};
                        }

                        return JSON.parse(jsonString);
                    } catch (e) {
                        throw new Error('Error parsing JSON');
                    }
                })
                .filter((obj) => obj !== null);
            return jsonObjects;
        }

        if (
            currentStatus === SchedulerJobStatus.ERROR &&
            'error' in jobResult.details
        ) {
            throw new Error(jobResult.details.error);
        }

        // eslint-disable-next-line @typescript-eslint/no-loop-func
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
};
