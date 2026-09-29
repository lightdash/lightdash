import {
    assertUnreachable,
    type ApiError,
    type GenerateAppRequestBody,
    type GenerateOrganizationChartTypeRequestBody,
    type AppVizBuildContext,
    type ApiGenerateAppResponse,
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type AppExternalConnectionReference,
    type DataAppClaudeModel,
    type DataAppCodexModel,
    type DataAppCreationExperience,
    type DataAppTemplate,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    appApiBase,
    type ChartTypeBuildTarget,
} from '../../chartTypes/utils/chartTypeOwner';

export type GenerateAppParams = {
    projectUuid: string;
    prompt: string;
    vizContext?: AppVizBuildContext;
    template?: DataAppTemplate;
    creationExperience: DataAppCreationExperience;
    fileIds?: string[];
    appUuid?: string; // pre-generated UUID so images are scoped to the app in S3
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    clarifications?: AppClarification[];
    spaceUuid?: string; // create directly inside this space (skips the personal-app step)
    claudeModel?: DataAppClaudeModel;
    codexModel?: DataAppCodexModel;
    // Theme (org design) to apply. `undefined` lets the server fall back to
    // the org default; `null` explicitly opts out of any theme; a uuid picks
    // a specific theme.
    designUuid?: string | null;
    // External connections to link to the app before generation.
    externalConnections?: AppExternalConnectionReference[];
    /** Organization chart types build through the organization routes. */
    target: ChartTypeBuildTarget;
};

type GenerateAppResult = ApiGenerateAppResponse['results'];

const generateApp = async ({
    projectUuid,
    prompt,
    vizContext,
    template,
    creationExperience,
    fileIds,
    appUuid,
    charts,
    dashboard,
    clarifications,
    spaceUuid,
    claudeModel,
    codexModel,
    designUuid,
    externalConnections,
    target,
}: GenerateAppParams): Promise<GenerateAppResult> => {
    const shared: Omit<
        GenerateOrganizationChartTypeRequestBody,
        'dataProjectUuid'
    > = {
        prompt,
        vizContext,
        creationExperience,
        fileIds,
        appUuid,
        charts,
        dashboard,
        clarifications,
        claudeModel,
        codexModel,
        // Send only when defined: `null` means "no theme"; `undefined`
        // means "honor org default" and omitting from the JSON body lets
        // the backend distinguish the two.
        ...(designUuid !== undefined ? { designUuid } : {}),
    };
    // Organization chart types have no template, space or connections.
    let body: GenerateAppRequestBody | GenerateOrganizationChartTypeRequestBody;
    switch (target.owner) {
        case 'organization':
            body = { ...shared, dataProjectUuid: target.dataProjectUuid };
            break;
        case 'project':
            body = { ...shared, template, spaceUuid, externalConnections };
            break;
        default:
            return assertUnreachable(target, 'Unknown chart type owner');
    }
    const data = await lightdashApi<GenerateAppResult>({
        method: 'POST',
        url: `${appApiBase(target.owner, projectUuid)}/`,
        body: JSON.stringify(body),
    });
    return data;
};

export const useGenerateApp = () =>
    useMutation<GenerateAppResult, ApiError, GenerateAppParams>({
        mutationFn: generateApp,
    });
