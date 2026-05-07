import {
    type ApiError,
    type ApiGenerateAppResponse,
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type DataAppTemplate,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GenerateAppParams = {
    projectUuid: string;
    prompt: string;
    template?: DataAppTemplate;
    imageIds?: string[];
    appUuid?: string; // pre-generated UUID so images are scoped to the app in S3
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    clarifications?: AppClarification[];
    spaceUuid?: string; // create directly inside this space (skips the personal-app step)
};

type GenerateAppResult = ApiGenerateAppResponse['results'];

const generateApp = async ({
    projectUuid,
    prompt,
    template,
    imageIds,
    appUuid,
    charts,
    dashboard,
    clarifications,
    spaceUuid,
}: GenerateAppParams): Promise<GenerateAppResult> => {
    const data = await lightdashApi<GenerateAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/`,
        body: JSON.stringify({
            prompt,
            template,
            imageIds,
            appUuid,
            charts,
            dashboard,
            clarifications,
            spaceUuid,
        }),
    });
    return data;
};

export const useGenerateApp = () =>
    useMutation<GenerateAppResult, ApiError, GenerateAppParams>({
        mutationFn: generateApp,
    });
