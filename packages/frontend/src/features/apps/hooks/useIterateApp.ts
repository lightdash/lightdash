import {
    type ApiError,
    type AppVizBuildContext,
    type ApiGenerateAppResponse,
    type AppChartReference,
    type AppDashboardReference,
    type AppExternalConnectionReference,
    type DataAppClaudeModel,
    type DataAppCodexModel,
    type DataAppCreationExperience,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type IterateAppParams = {
    projectUuid: string;
    appUuid: string;
    prompt: string;
    vizContext?: AppVizBuildContext;
    creationExperience: DataAppCreationExperience;
    fileIds?: string[];
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    claudeModel?: DataAppClaudeModel;
    codexModel?: DataAppCodexModel;
    externalConnections?: AppExternalConnectionReference[];
    designUuid?: string | null;
};

type IterateAppResult = ApiGenerateAppResponse['results'];

const iterateApp = async ({
    projectUuid,
    appUuid,
    prompt,
    vizContext,
    creationExperience,
    fileIds,
    charts,
    dashboard,
    claudeModel,
    codexModel,
    externalConnections,
    designUuid,
}: IterateAppParams): Promise<IterateAppResult> => {
    const data = await lightdashApi<IterateAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions`,
        body: JSON.stringify({
            prompt,
            vizContext,
            creationExperience,
            fileIds,
            charts,
            dashboard,
            claudeModel,
            codexModel,
            externalConnections,
            ...(designUuid !== undefined ? { designUuid } : {}),
        }),
    });
    return data;
};

export const useIterateApp = () =>
    useMutation<IterateAppResult, ApiError, IterateAppParams>({
        mutationFn: iterateApp,
    });
