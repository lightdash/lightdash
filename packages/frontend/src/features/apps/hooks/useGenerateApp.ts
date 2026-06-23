import {
    type ApiError,
    type ApiGenerateAppResponse,
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type AppExternalConnectionReference,
    type DataAppClaudeModel,
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
    claudeModel?: DataAppClaudeModel;
    // Theme (org design) to apply. `undefined` lets the server fall back to
    // the org default; `null` explicitly opts out of any theme; a uuid picks
    // a specific theme.
    designUuid?: string | null;
    // External connections to link to the app before generation.
    externalConnections?: AppExternalConnectionReference[];
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
    claudeModel,
    designUuid,
    externalConnections,
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
            claudeModel,
            externalConnections,
            // Send only when defined: `null` means "no theme"; `undefined`
            // means "honor org default" and omitting from the JSON body lets
            // the backend distinguish the two.
            ...(designUuid !== undefined ? { designUuid } : {}),
        }),
    });
    return data;
};

export const useGenerateApp = () =>
    useMutation<GenerateAppResult, ApiError, GenerateAppParams>({
        mutationFn: generateApp,
    });
