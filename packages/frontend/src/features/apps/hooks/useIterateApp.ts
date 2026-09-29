import {
    assertUnreachable,
    type ApiError,
    type GenerateAppRequestBody,
    type GenerateOrganizationChartTypeRequestBody,
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
import {
    appApiBase,
    type ChartTypeBuildTarget,
} from '../../chartTypes/utils/chartTypeOwner';

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
    /** Organization chart types build through the organization routes. */
    target: ChartTypeBuildTarget;
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
    target,
}: IterateAppParams): Promise<IterateAppResult> => {
    const shared: Omit<
        GenerateOrganizationChartTypeRequestBody,
        'dataProjectUuid'
    > = {
        prompt,
        vizContext,
        creationExperience,
        fileIds,
        charts,
        dashboard,
        claudeModel,
        codexModel,
        ...(designUuid !== undefined ? { designUuid } : {}),
    };
    let body: GenerateAppRequestBody | GenerateOrganizationChartTypeRequestBody;
    switch (target.owner) {
        case 'organization':
            body = { ...shared, dataProjectUuid: target.dataProjectUuid };
            break;
        case 'project':
            body = { ...shared, externalConnections };
            break;
        default:
            return assertUnreachable(target, 'Unknown chart type owner');
    }
    const data = await lightdashApi<IterateAppResult>({
        method: 'POST',
        url: `${appApiBase(target.owner, projectUuid)}/${appUuid}/versions`,
        body: JSON.stringify(body),
    });
    return data;
};

export const useIterateApp = () =>
    useMutation<IterateAppResult, ApiError, IterateAppParams>({
        mutationFn: iterateApp,
    });
