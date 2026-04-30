import {
    type ApiClarifyAppResponse,
    type ApiError,
    type DataAppTemplate,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type ClarifyAppParams = {
    projectUuid: string;
    prompt: string;
    template?: DataAppTemplate;
};

type ClarifyAppResult = ApiClarifyAppResponse['results'];

const clarifyApp = async ({
    projectUuid,
    prompt,
    template,
}: ClarifyAppParams): Promise<ClarifyAppResult> =>
    lightdashApi<ClarifyAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/clarify`,
        body: JSON.stringify({ prompt, template }),
    });

export const useClarifyApp = () =>
    useMutation<ClarifyAppResult, ApiError, ClarifyAppParams>({
        mutationFn: clarifyApp,
    });
