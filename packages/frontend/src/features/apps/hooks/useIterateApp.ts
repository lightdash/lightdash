import { type ApiError, type ApiGenerateAppResponse } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type IterateAppParams = {
    projectUuid: string;
    appUuid: string;
    prompt: string;
    imageId?: string;
    chartUuids?: string[];
};

type IterateAppResult = ApiGenerateAppResponse['results'];

const iterateApp = async ({
    projectUuid,
    appUuid,
    prompt,
    imageId,
    chartUuids,
}: IterateAppParams): Promise<IterateAppResult> => {
    const data = await lightdashApi<IterateAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions`,
        body: JSON.stringify({ prompt, imageId, chartUuids }),
    });
    return data;
};

export const useIterateApp = () =>
    useMutation<IterateAppResult, ApiError, IterateAppParams>({
        mutationFn: iterateApp,
    });
