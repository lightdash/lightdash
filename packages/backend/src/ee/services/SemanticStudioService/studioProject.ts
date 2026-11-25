import {
    DbtProjectType,
    getErrorMessage,
    type Project,
    type SemanticLayerApplyMode,
    type SemanticLayerStatus,
    type SessionUser,
} from '@lightdash/common';
import {
    type LightdashAnalytics,
    type SemanticStudioActivity,
} from '../../../analytics/LightdashAnalytics';
import type Logger from '../../../logging/logger';
import { keepsModelsInGithub } from './repoModels';

/** The parts of a project that decide whether its models are kept here. */
export type ModelProject = Pick<
    Project,
    | 'projectUuid'
    | 'organizationUuid'
    | 'upstreamProjectUuid'
    | 'type'
    | 'createdByUserUuid'
> & { dbtConnection: Project['dbtConnection'] };

export const applyModeOf = (
    dbtConnection: ModelProject['dbtConnection'],
): SemanticLayerApplyMode => {
    if (keepsModelsInGithub(dbtConnection)) return 'pull_request';
    // A dbt project keeps no draft: the agent edits the repository in a pull request.
    return dbtConnection.type === DbtProjectType.NONE
        ? 'live'
        : 'dbt_pull_request';
};

/** Whether a status lets this person work on the project as a dbt project's pull requests. */
export const worksAsDbtPullRequests = ({
    enabled,
    appliesAs,
}: Pick<SemanticLayerStatus, 'enabled' | 'appliesAs'>): boolean =>
    enabled && appliesAs === 'dbt_pull_request';

/** Never awaited, so a failed lookup cannot hold up or fail the action it describes. */
export const trackStudioActivity = (
    {
        analytics,
        projectModel,
        logger,
    }: {
        analytics: Pick<LightdashAnalytics, 'track'>;
        projectModel: { get: (projectUuid: string) => Promise<ModelProject> };
        logger: typeof Logger;
    },
    user: SessionUser,
    projectUuid: string,
    { event, properties }: SemanticStudioActivity,
): void => {
    projectModel
        .get(projectUuid)
        .then(({ organizationUuid, dbtConnection }) =>
            analytics.track({
                event,
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    appliesAs: applyModeOf(dbtConnection),
                    ...properties,
                },
            }),
        )
        .catch((error: unknown) => {
            logger.warn(
                `SemanticStudio: failed to track ${event}: ${getErrorMessage(error)}`,
            );
        });
};
