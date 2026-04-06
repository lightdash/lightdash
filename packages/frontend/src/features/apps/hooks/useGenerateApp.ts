import {
    type ApiError,
    type ApiGenerateAppResponse,
    type AppImageAttachment,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GenerateAppParams = {
    projectUuid: string;
    prompt: string;
    image?: AppImageAttachment;
    appUuid?: string; // pre-generated UUID so images are scoped to the app in S3
};

type GenerateAppResult = ApiGenerateAppResponse['results'];

const generateApp = async ({
    projectUuid,
    prompt,
    image,
    appUuid,
}: GenerateAppParams): Promise<GenerateAppResult> => {
    const data = await lightdashApi<GenerateAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/`,
        body: JSON.stringify({ prompt, image, appUuid }),
    });
    return data;
};

export const useGenerateApp = () =>
    useMutation<GenerateAppResult, ApiError, GenerateAppParams>({
        mutationFn: generateApp,
    });
