import { type ApiError, type ApiGenerateAppResponse } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GenerateAppParams = {
    projectUuid: string;
    prompt: string;
    imageId?: string;
    appUuid?: string; // pre-generated UUID so images are scoped to the app in S3
    chartUuids?: string[];
    dashboardUuid?: string;
};

type GenerateAppResult = ApiGenerateAppResponse['results'];

const generateApp = async ({
    projectUuid,
    prompt,
    imageId,
    appUuid,
    chartUuids,
    dashboardUuid,
}: GenerateAppParams): Promise<GenerateAppResult> => {
    const data = await lightdashApi<GenerateAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/`,
        body: JSON.stringify({
            prompt,
            imageId,
            appUuid,
            chartUuids,
            dashboardUuid,
        }),
    });
    return data;
};

export const useGenerateApp = () =>
    useMutation<GenerateAppResult, ApiError, GenerateAppParams>({
        mutationFn: generateApp,
    });
