import {
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type AppExternalConnectionReference,
    type DataAppTemplate,
} from '@lightdash/common';
import { type ClarifyParams } from '../hooks/useClarificationRound';
import { type DataAppModelSelection } from '../hooks/useDataAppModelSelection';
import { type GenerateAppParams } from '../hooks/useGenerateApp';

/** Everything the generate call needs, snapshotted at submit time so a
 *  mid-round model or theme switch cannot change what the build runs against. */
export type AppBuildRequest = {
    prompt: string;
    template: DataAppTemplate | undefined;
    fileIds: string[] | undefined;
    appUuid: string;
    charts: AppChartReference[] | undefined;
    dashboard: AppDashboardReference | undefined;
    externalConnections: AppExternalConnectionReference[] | undefined;
    spaceUuid: string | undefined;
    modelRequest: DataAppModelSelection['modelRequest'];
    designUuid: string | null;
};

export const toAppClarifyParams = (
    request: AppBuildRequest,
): ClarifyParams => ({
    prompt: request.prompt,
    template: request.template,
    charts: request.charts,
    dashboard: request.dashboard,
    fileIds: request.fileIds,
});

export const toAppGeneratePayload = (
    projectUuid: string,
    request: AppBuildRequest,
    clarifications: AppClarification[],
): GenerateAppParams => ({
    projectUuid,
    prompt: request.prompt,
    template: request.template,
    creationExperience: 'app_builder',
    fileIds: request.fileIds,
    appUuid: request.appUuid,
    charts: request.charts,
    dashboard: request.dashboard,
    externalConnections: request.externalConnections,
    // An empty round is the same as no round at all to the backend.
    clarifications: clarifications.length > 0 ? clarifications : undefined,
    spaceUuid: request.spaceUuid,
    ...request.modelRequest,
    designUuid: request.designUuid,
});
