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
    imageIds?: string[];
};

type ClarifyAppResult = ApiClarifyAppResponse['results'];

const clarifyApp = async ({
    projectUuid,
    prompt,
    template,
    charts,
    dashboard,
    imageIds,
}: ClarifyAppParams): Promise<ClarifyAppResult> =>
    lightdashApi<ClarifyAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/clarify`,
        body: JSON.stringify({
            prompt,
            template,
            charts,
            dashboard,
            imageIds,
        }),
    });

export const useClarifyApp = () =>
    useMutation<ClarifyAppResult, ApiError, ClarifyAppParams>({
        mutationFn: clarifyApp,
    });
