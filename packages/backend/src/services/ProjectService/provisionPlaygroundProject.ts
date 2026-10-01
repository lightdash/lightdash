import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    DuckdbConnectionType,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ProjectType,
    ProvisioningSource,
    RequestMethod,
    WarehouseTypes,
    type EnsurePlaygroundProjectResults,
    type OrganizationProject,
    type PlaygroundProjectTrigger,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import path from 'path';
import {
    type LightdashAnalytics,
    type OnboardingFlow,
    type PlaygroundProjectSkippedReason,
} from '../../analytics/LightdashAnalytics';
import { type PlaygroundContent } from '../../ee/services/ProjectService/playgroundContentTypes';
import Logger from '../../logging/logger';
import { type OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type CatalogService } from '../CatalogService/CatalogService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import {
    getCurrentPlaygroundBundleVersion,
    getServablePlaygroundBundleVersions,
    loadPlaygroundBundle,
    PLAYGROUND_DATASET,
    shouldAdoptPlaygroundBundle,
    validatePlaygroundDatabaseBundle,
    type PlaygroundBundle,
    type PlaygroundDatabaseCheck,
} from './playgroundBundle';
import { type ProjectService } from './ProjectService';

export type ProvisionPlaygroundProjectArguments = {
    user: SessionUser;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    projectModel: Pick<
        ProjectModel,
        | 'getAllByOrganizationUuid'
        | 'delete'
        | 'saveExploresToCache'
        | 'getPlaygroundBundleVersion'
        | 'recordPlaygroundBundleVersionSeen'
        | 'hasCachedExplores'
    >;
    onboardingModel: Pick<
        OnboardingModel,
        | 'getPlaygroundContentSeedVersion'
        | 'setPlaygroundContentSeedVersion'
        | 'runInPlaygroundProvisioningLock'
    >;
    projectService: Pick<ProjectService, 'createWithoutCompile'>;
    catalogService: Pick<CatalogService, 'indexCatalog'>;
    seedPlaygroundContent: (args: {
        projectUuid: string;
        user: SessionUser;
        content: PlaygroundContent;
        publicSpace: boolean;
    }) => Promise<void>;
    analytics: Pick<LightdashAnalytics, 'track'>;
    canViewProject: (project: OrganizationProject) => boolean;
    isPlaygroundEnabled: boolean;
    trigger?: PlaygroundProjectTrigger;
    hasActiveAgentOnboardingRun?: () => Promise<boolean>;
    playgroundDataDirectory?: string;
    validatePlaygroundDatabase?: (
        check: PlaygroundDatabaseCheck,
    ) => Promise<void>;
    now?: Date;
};

const getErrorType = (error: unknown): string =>
    error instanceof Error ? error.name : 'Unknown';

export const provisionPlaygroundProject = async ({
    user,
    featureFlagService,
    projectModel,
    onboardingModel,
    projectService,
    catalogService,
    seedPlaygroundContent,
    analytics,
    canViewProject,
    isPlaygroundEnabled,
    trigger = 'invite_expert',
    hasActiveAgentOnboardingRun,
    playgroundDataDirectory,
    validatePlaygroundDatabase = validatePlaygroundDatabaseBundle,
    now = new Date(),
}: ProvisionPlaygroundProjectArguments): Promise<EnsurePlaygroundProjectResults> => {
    const { organizationUuid } = user;
    if (!organizationUuid) {
        throw new ForbiddenError('User is not part of an organization');
    }

    const [featureFlag, connectJourneyFlag] = await Promise.all([
        featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.NewOnboarding,
        }),
        featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.ConnectJourney,
        }),
    ]);
    const isConnectJourney = connectJourneyFlag.enabled;
    const onboardingFlow: OnboardingFlow = featureFlag.enabled
        ? 'new'
        : 'legacy';
    let outcomeTracked = false;
    const trackSkipped = (
        reason: PlaygroundProjectSkippedReason,
        projectId: string | null,
    ) => {
        outcomeTracked = true;
        analytics.track({
            event: 'playground_project.skipped',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId,
                trigger,
                onboardingFlow,
                reason,
            },
        });
    };
    if (!isPlaygroundEnabled) {
        trackSkipped('instance_disabled', null);
        throw new NotFoundError('Sample data is turned off on this instance');
    }
    if (!featureFlag.enabled) {
        trackSkipped('new_onboarding_flag_disabled', null);
        throw new NotFoundError('Playground projects are not available');
    }

    let lastKnownProjectUuid: string | null = null;
    try {
        return await onboardingModel.runInPlaygroundProvisioningLock(
            organizationUuid,
            async (trx) => {
                const dataDirectory = path.resolve(
                    playgroundDataDirectory ??
                        process.env.PLAYGROUND_DATA_DIR ??
                        path.join(__dirname, '../../../assets/playground'),
                );
                const projects =
                    await projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );
                const accessibleProjects = projects.filter(canViewProject);
                const playground = (
                    isConnectJourney ? projects : accessibleProjects
                ).find(
                    (project) =>
                        project.provisioningSource ===
                        ProvisioningSource.PLAYGROUND,
                );
                if (playground && !canViewProject(playground)) {
                    trackSkipped('no_project_access', playground.projectUuid);
                    throw new ForbiddenError(
                        'User does not have permission to view the Playground',
                    );
                }
                if (playground) {
                    lastKnownProjectUuid = playground.projectUuid;
                    let bundle: PlaygroundBundle | null = null;
                    const getBundle = async () => {
                        bundle ??= await loadPlaygroundBundle(
                            dataDirectory,
                            validatePlaygroundDatabase,
                        );
                        return bundle;
                    };
                    const currentVersion =
                        getCurrentPlaygroundBundleVersion(dataDirectory);
                    const projectVersion =
                        await projectModel.getPlaygroundBundleVersion(
                            playground.projectUuid,
                        );
                    // A cache on the current version needs no write. An empty
                    // cache means provisioning stopped before it was filled.
                    // Otherwise the adoption rule decides, because other
                    // servers may still serve the project's version.
                    if (
                        projectVersion !== currentVersion &&
                        (!(await projectModel.hasCachedExplores(
                            playground.projectUuid,
                        )) ||
                            shouldAdoptPlaygroundBundle({
                                projectVersion,
                                currentVersion,
                                servableVersions:
                                    getServablePlaygroundBundleVersions(
                                        dataDirectory,
                                    ),
                                currentFirstSeenAt:
                                    await projectModel.recordPlaygroundBundleVersionSeen(
                                        currentVersion,
                                    ),
                                now,
                            }))
                    ) {
                        const { explores, version } = await getBundle();
                        await projectModel.saveExploresToCache(
                            playground.projectUuid,
                            explores,
                            true,
                            undefined,
                            version,
                        );
                        if (isConnectJourney) {
                            await catalogService
                                .indexCatalog(
                                    playground.projectUuid,
                                    user.userUuid,
                                )
                                .catch((error) => {
                                    Sentry.captureException(error);
                                    Logger.error(
                                        `Failed to index playground catalog for project ${playground.projectUuid}: ${getErrorType(
                                            error,
                                        )}`,
                                    );
                                });
                        }
                    }
                    try {
                        const seedVersion =
                            await onboardingModel.getPlaygroundContentSeedVersion(
                                organizationUuid,
                                trx,
                            );
                        if (seedVersion === null) {
                            const { content } = await getBundle();
                            await seedPlaygroundContent({
                                projectUuid: playground.projectUuid,
                                user,
                                content,
                                publicSpace: isConnectJourney,
                            });
                            await onboardingModel.setPlaygroundContentSeedVersion(
                                organizationUuid,
                                content.version,
                                trx,
                            );
                        }
                    } catch (error) {
                        Sentry.captureException(error);
                        Logger.error(
                            `Failed to seed playground content for project ${playground.projectUuid}: ${
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            }`,
                        );
                    }
                    trackSkipped(
                        'playground_already_exists',
                        playground.projectUuid,
                    );
                    return {
                        projectUuid: playground.projectUuid,
                        created: false,
                    };
                }
                // The wait-trigger provisions alongside existing projects, so
                // it is only honoured while a run it could be waiting on exists
                const isWaitingOnRun =
                    trigger === 'agent_onboarding_wait' &&
                    (await hasActiveAgentOnboardingRun?.()) === true;
                if (
                    projects.length > 0 &&
                    !isWaitingOnRun &&
                    !isConnectJourney
                ) {
                    const existingProject = accessibleProjects[0];
                    if (!existingProject) {
                        trackSkipped('no_project_access', null);
                        throw new ForbiddenError(
                            'User does not have permission to view an existing project',
                        );
                    }
                    trackSkipped(
                        'organization_has_project',
                        existingProject.projectUuid,
                    );
                    return {
                        projectUuid: existingProject.projectUuid,
                        created: false,
                    };
                }

                const { explores, content, version } =
                    await loadPlaygroundBundle(
                        dataDirectory,
                        validatePlaygroundDatabase,
                    );

                const creation = await projectService.createWithoutCompile(
                    user,
                    {
                        name: 'Playground (sample data)',
                        type: ProjectType.DEFAULT,
                        dbtConnection: { type: DbtProjectType.NONE },
                        dbtVersion: DefaultSupportedDbtVersion,
                        warehouseConnection: {
                            type: WarehouseTypes.DUCKDB,
                            connectionType: DuckdbConnectionType.EMBEDDED,
                            dataset: PLAYGROUND_DATASET,
                        },
                    },
                    RequestMethod.BACKEND,
                    { source: ProvisioningSource.PLAYGROUND },
                );
                const { projectUuid } = creation.project;
                lastKnownProjectUuid = projectUuid;

                try {
                    await projectModel.saveExploresToCache(
                        projectUuid,
                        explores,
                        true,
                        undefined,
                        version,
                    );
                } catch (error) {
                    await projectModel
                        .delete(projectUuid)
                        .catch((cleanupError) => {
                            Sentry.captureException(cleanupError);
                            Logger.error(
                                `Failed to remove incomplete playground project ${projectUuid}: ${
                                    cleanupError instanceof Error
                                        ? cleanupError.message
                                        : String(cleanupError)
                                }`,
                            );
                        });
                    throw error;
                }

                let contentSeedErrorType: string | null = null;
                try {
                    await seedPlaygroundContent({
                        projectUuid,
                        user,
                        content,
                        publicSpace: isConnectJourney,
                    });
                    await onboardingModel.setPlaygroundContentSeedVersion(
                        organizationUuid,
                        content.version,
                        trx,
                    );
                } catch (error) {
                    Sentry.captureException(error);
                    Logger.error(
                        `Failed to seed playground content for project ${projectUuid}: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    );
                    contentSeedErrorType = getErrorType(error);
                }

                let catalogIndexErrorType: string | null = null;
                try {
                    await catalogService.indexCatalog(
                        projectUuid,
                        user.userUuid,
                    );
                } catch (error) {
                    Sentry.captureException(error);
                    Logger.error(
                        `Failed to index playground catalog for project ${projectUuid}: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    );
                    catalogIndexErrorType = getErrorType(error);
                }

                outcomeTracked = true;
                analytics.track({
                    event: 'playground_project.provisioned',
                    userId: user.userUuid,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        trigger,
                        onboardingFlow,
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
                event: 'playground_project.failed',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: lastKnownProjectUuid,
                    trigger,
                    onboardingFlow,
                    errorType: getErrorType(error),
                },
            });
        }
        throw error;
    }
};
