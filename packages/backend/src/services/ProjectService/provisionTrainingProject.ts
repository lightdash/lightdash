import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    DuckdbConnectionType,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ProjectMemberRole,
    ProjectType,
    RequestMethod,
    WarehouseTypes,
    type EnableLearnResults,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import path from 'path';
import {
    type LightdashAnalytics,
    type TrainingProjectSkippedReason,
} from '../../analytics/LightdashAnalytics';
import { type PlaygroundContent } from '../../ee/services/ProjectService/playgroundContentTypes';
import {
    loadPlaygroundBundle,
    validatePlaygroundDatabaseBundle,
} from '../../ee/services/ProjectService/provisionPlaygroundProject';
import Logger from '../../logging/logger';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type CatalogService } from '../CatalogService/CatalogService';
import { type ProjectService } from './ProjectService';

/** The seeded root space of a training project; public so every role sees it. */
export const TRAINING_SPACE = { name: 'Training', path: 'training' } as const;
export const TRAINING_PROJECT_NAME = 'Training (sample data)';

export type SeedTrainingContentArguments = {
    projectUuid: string;
    user: SessionUser;
    content: PlaygroundContent;
};

export type ProvisionTrainingProjectArguments = {
    user: SessionUser;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    projectModel: Pick<
        ProjectModel,
        | 'getAllByOrganizationUuid'
        | 'saveExploresToCache'
        | 'delete'
        | 'createProjectAccess'
    >;
    onboardingModel: Pick<OnboardingModel, 'runInTrainingProvisioningLock'>;
    projectService: Pick<ProjectService, 'createWithoutCompile'>;
    catalogService: Pick<CatalogService, 'indexCatalog'>;
    seedTrainingContent: (args: SeedTrainingContentArguments) => Promise<void>;
    analytics: Pick<LightdashAnalytics, 'track'>;
    trainingDataDirectory?: string;
    validateTrainingDatabase?: (databasePath: string) => Promise<void>;
};

const getErrorType = (error: unknown): string =>
    error instanceof Error ? error.name : 'Unknown';

const describe = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Enable Learn for an organization (CS-257): create its training project
 * from the embedded bundle, seed the content the walkthroughs use, and make
 * the admin who clicked the project's assigned admin. Idempotent under a
 * per-organization lock: a second call returns the existing project.
 *
 * The bundle is the playground's (same DuckDB dataset and explores); only
 * the project type, name and the seeded space differ. The training bundle
 * of CS-207 Slice 1 replaces it when it lands.
 *
 * Authorisation is the caller's: `ProjectService.enableLearn` checks
 * `manage:Organization` before calling this, and it is the only route
 * reachable by users. The service wiring and the dev provisioning script
 * also call it, deliberately without a user check, for an org they already
 * administer. The organisation guard here narrows the type; it is not the
 * permission check.
 */
export const provisionTrainingProject = async ({
    user,
    featureFlagModel,
    projectModel,
    onboardingModel,
    projectService,
    catalogService,
    seedTrainingContent,
    analytics,
    trainingDataDirectory,
    validateTrainingDatabase = validatePlaygroundDatabaseBundle,
}: ProvisionTrainingProjectArguments): Promise<EnableLearnResults> => {
    const { organizationUuid } = user;
    if (!organizationUuid) {
        throw new ForbiddenError('User is not part of an organization');
    }
    let outcomeTracked = false;
    const trackSkipped = (
        reason: TrainingProjectSkippedReason,
        projectId: string | null,
    ) => {
        outcomeTracked = true;
        analytics.track({
            event: 'training_project.skipped',
            userId: user.userUuid,
            properties: { organizationId: organizationUuid, projectId, reason },
        });
    };
    const { enabled: learnEnabled } = await featureFlagModel.get({
        user,
        featureFlagId: FeatureFlags.EnableLearn,
    });
    if (!learnEnabled) {
        trackSkipped('learn_disabled', null);
        throw new NotFoundError('Learn is not enabled for this organization');
    }
    if (!user.email) {
        throw new ForbiddenError(
            'The enabling user needs an email to be made the training project admin',
        );
    }
    const { email } = user;

    let lastKnownProjectUuid: string | null = null;
    try {
        return await onboardingModel.runInTrainingProvisioningLock(
            organizationUuid,
            async () => {
                const projects =
                    await projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );
                const existing = projects.find(
                    (project) => project.type === ProjectType.TRAINING,
                );
                if (existing) {
                    lastKnownProjectUuid = existing.projectUuid;
                    trackSkipped(
                        'training_project_already_exists',
                        existing.projectUuid,
                    );
                    return {
                        projectUuid: existing.projectUuid,
                        created: false,
                    };
                }

                const dataDirectory = path.resolve(
                    trainingDataDirectory ??
                        process.env.PLAYGROUND_DATA_DIR ??
                        path.join(__dirname, '../../../assets/playground'),
                );
                const { explores, content } = await loadPlaygroundBundle(
                    dataDirectory,
                    validateTrainingDatabase,
                );

                const creation = await projectService.createWithoutCompile(
                    user,
                    {
                        name: TRAINING_PROJECT_NAME,
                        type: ProjectType.TRAINING,
                        dbtConnection: { type: DbtProjectType.NONE },
                        dbtVersion: DefaultSupportedDbtVersion,
                        warehouseConnection: {
                            type: WarehouseTypes.DUCKDB,
                            connectionType: DuckdbConnectionType.EMBEDDED,
                            dataset: 'jaffle_shop',
                        },
                    },
                    RequestMethod.BACKEND,
                    { source: 'training' },
                );
                const { projectUuid } = creation.project;
                lastKnownProjectUuid = projectUuid;

                // Explores and the assigned admin are what make the project
                // usable; without either, remove it rather than leave a
                // half-made training project the page cannot recover from.
                try {
                    await projectModel.saveExploresToCache(
                        projectUuid,
                        explores,
                        true,
                    );
                    await projectModel.createProjectAccess(
                        projectUuid,
                        email,
                        ProjectMemberRole.ADMIN,
                    );
                } catch (error) {
                    await projectModel
                        .delete(projectUuid)
                        .catch((cleanupError) => {
                            Sentry.captureException(cleanupError);
                            Logger.error(
                                `Failed to remove incomplete training project ${projectUuid}: ${describe(
                                    cleanupError,
                                )}`,
                            );
                        });
                    throw error;
                }

                // A half-seeded training project has no repair path (the
                // seed is not idempotent), so a failed seed removes the
                // project and the admin enables again.
                try {
                    await seedTrainingContent({
                        projectUuid,
                        user,
                        content: { ...content, space: { ...TRAINING_SPACE } },
                    });
                } catch (error) {
                    Logger.error(
                        `Failed to seed training content for project ${projectUuid}: ${describe(
                            error,
                        )}`,
                    );
                    await projectModel
                        .delete(projectUuid)
                        .catch((cleanupError) => {
                            Sentry.captureException(cleanupError);
                            Logger.error(
                                `Failed to remove unseeded training project ${projectUuid}: ${describe(
                                    cleanupError,
                                )}`,
                            );
                        });
                    throw error;
                }
                const contentSeedErrorType: string | null = null;

                let catalogIndexErrorType: string | null = null;
                try {
                    await catalogService.indexCatalog(
                        projectUuid,
                        user.userUuid,
                    );
                } catch (error) {
                    Sentry.captureException(error);
                    Logger.error(
                        `Failed to index training catalog for project ${projectUuid}: ${describe(
                            error,
                        )}`,
                    );
                    catalogIndexErrorType = getErrorType(error);
                }

                outcomeTracked = true;
                analytics.track({
                    event: 'training_project.provisioned',
                    userId: user.userUuid,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        contentSeedErrorType,
                        catalogIndexErrorType,
                    },
                });
                return { projectUuid, created: true };
            },
        );
    } catch (error) {
        if (!outcomeTracked) {
            analytics.track({
                event: 'training_project.failed',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: lastKnownProjectUuid,
                    errorType: getErrorType(error),
                },
            });
        }
        throw error;
    }
};
