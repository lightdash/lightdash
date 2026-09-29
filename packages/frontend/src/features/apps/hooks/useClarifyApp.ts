import {
    assertUnreachable,
    type ApiClarifyAppRequest,
    type ApiClarifyOrganizationChartTypeRequest,
    type ApiClarifyAppResponse,
    type ApiError,
    type AppChartReference,
    type AppDashboardReference,
    type DataAppTemplate,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    appApiBase,
    type ChartTypeBuildTarget,
} from '../../chartTypes/utils/chartTypeOwner';

type ClarifyAppParams = {
    projectUuid: string;
    prompt: string;
    template?: DataAppTemplate;
    charts?: AppChartReference[];
    dashboard?: AppDashboardReference;
    fileIds?: string[];
    /** Organization chart types clarify through the organization routes. */
    target: ChartTypeBuildTarget;
    /** Drops the request when the round it belongs to is abandoned. */
    signal?: AbortSignal;
};

type ClarifyAppResult = ApiClarifyAppResponse['results'];

const toClarifyBody = ({
    prompt,
    template,
    charts,
    dashboard,
    fileIds,
    target,
}: ClarifyAppParams):
    | ApiClarifyAppRequest
    | ApiClarifyOrganizationChartTypeRequest => {
    switch (target.owner) {
        case 'organization':
            return {
                prompt,
                charts,
                dashboard,
                fileIds,
                dataProjectUuid: target.dataProjectUuid,
            };
        case 'project':
            return { prompt, template, charts, dashboard, fileIds };
        default:
            return assertUnreachable(target, 'Unknown chart type owner');
    }
};

const clarifyApp = async (
    params: ClarifyAppParams,
): Promise<ClarifyAppResult> =>
    lightdashApi<ClarifyAppResult>({
        method: 'POST',
        url: `${appApiBase(params.target.owner, params.projectUuid)}/clarify`,
        body: JSON.stringify(toClarifyBody(params)),
        signal: params.signal,
    });

export const useClarifyApp = () =>
    useMutation<ClarifyAppResult, ApiError, ClarifyAppParams>({
        mutationFn: clarifyApp,
    });
