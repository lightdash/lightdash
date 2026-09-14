import {
    type ApiClarifyAppResponse,
    type ApiError,
    type AppChartReference,
    type AppDashboardReference,
    type DataAppTemplate,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type ClarifyAppParams = {
    projectUuid: string;
    prompt: string;
    template?: DataAppTemplate;
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    fileIds?: string[];
    /** Drops the request when the round it belongs to is abandoned. */
    signal?: AbortSignal;
};

type ClarifyAppResult = ApiClarifyAppResponse['results'];

const clarifyApp = async ({
    projectUuid,
    prompt,
    template,
    charts,
    dashboard,
    fileIds,
    signal,
}: ClarifyAppParams): Promise<ClarifyAppResult> =>
    lightdashApi<ClarifyAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/clarify`,
        body: JSON.stringify({
            prompt,
            template,
            charts,
            dashboard,
            fileIds,
        }),
        signal,
    });

export const useClarifyApp = () =>
    useMutation<ClarifyAppResult, ApiError, ClarifyAppParams>({
        mutationFn: clarifyApp,
    });
