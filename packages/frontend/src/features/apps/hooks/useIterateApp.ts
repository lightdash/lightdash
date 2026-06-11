import {
    type ApiError,
    type ApiGenerateAppResponse,
    type AppChartReference,
    type AppDashboardReference,
    type DataAppClaudeModel,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type IterateAppParams = {
    projectUuid: string;
    appUuid: string;
    prompt: string;
    imageIds?: string[];
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    claudeModel?: DataAppClaudeModel;
};

type IterateAppResult = ApiGenerateAppResponse['results'];

const iterateApp = async ({
    projectUuid,
    appUuid,
    prompt,
    imageIds,
    charts,
    dashboard,
    claudeModel,
}: IterateAppParams): Promise<IterateAppResult> => {
    const data = await lightdashApi<IterateAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions`,
        body: JSON.stringify({
            prompt,
            imageIds,
            charts,
            dashboard,
            claudeModel,
        }),
    });
    return data;
};

export const useIterateApp = () =>
    useMutation<IterateAppResult, ApiError, IterateAppParams>({
        mutationFn: iterateApp,
    });
