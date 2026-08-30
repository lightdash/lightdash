import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    DuckdbConnectionType,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ProjectType,
    RequestMethod,
    WarehouseTypes,
    type EnsurePlaygroundProjectResults,
    type Explore,
    type ExploreError,
    type OrganizationProject,
    type PlaygroundProjectTrigger,
    type SessionUser,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import {
    type LightdashAnalytics,
    type OnboardingFlow,
    type PlaygroundProjectSkippedReason,
} from '../../../analytics/LightdashAnalytics';
import Logger from '../../../logging/logger';
import { type OnboardingModel } from '../../../models/OnboardingModel/OnboardingModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type CatalogService } from '../../../services/CatalogService/CatalogService';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { type PlaygroundContent } from './playgroundContentTypes';

export type ProvisionPlaygroundProjectArguments = {
    user: SessionUser;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    projectModel: Pick<
        ProjectModel,
        'getAllByOrganizationUuid' | 'delete' | 'saveExploresToCache'
    >;
    onboardingModel: Pick<
        OnboardingModel,
        'getByOrganizationUuid' | 'runInPlaygroundProvisioningLock'
    >;
    projectService: Pick<ProjectService, 'createWithoutCompile'>;
    catalogService: Pick<CatalogService, 'indexCatalog'>;
    seedPlaygroundContent: (args: {
        projectUuid: string;
        user: SessionUser;
        content: PlaygroundContent;
    }) => Promise<void>;
    analytics: Pick<LightdashAnalytics, 'track'>;
    canViewProject: (project: OrganizationProject) => boolean;
    trigger?: PlaygroundProjectTrigger;
    hasActiveAgentOnboardingRun?: () => Promise<boolean>;
    playgroundDataDirectory?: string;
    validatePlaygroundDatabase?: (databasePath: string) => Promise<void>;
};

const validatePlaygroundDatabaseBundle = async (): Promise<void> => {
    const client = new DuckdbWarehouseClient({
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.EMBEDDED,
        dataset: 'jaffle_shop',
    });
    await client.runQuery('SELECT count(*) FROM information_schema.tables');
};

const loadPlaygroundBundle = async (
    dataDirectory: string,
    validatePlaygroundDatabase: (databasePath: string) => Promise<void>,
): Promise<{
    explores: (Explore | ExploreError)[];
    content: PlaygroundContent;
}> => {
    const [exploresJson, contentJson] = await Promise.all([
        fs.readFile(path.join(dataDirectory, 'explores.json'), 'utf8'),
        fs.readFile(path.join(dataDirectory, 'content.json'), 'utf8'),
        validatePlaygroundDatabase(
            path.join(dataDirectory, 'jaffle_shop.duckdb'),
        ),
    ]);

    let explores: unknown;
    let content: unknown;
    try {
        explores = JSON.parse(exploresJson);
        content = JSON.parse(contentJson);
    } catch (error) {
        throw new Error('Playground bundle contains invalid JSON', {
            cause: error,
        });
    }
    if (!Array.isArray(explores)) {
        throw new Error('Playground explores bundle must contain an array');
    }
    if (
        !content ||
        typeof content !== 'object' ||
        !('version' in content) ||
        content.version !== 1 ||
        !('space' in content) ||
        !content.space ||
        typeof content.space !== 'object' ||
        !('name' in content.space) ||
        typeof content.space.name !== 'string' ||
        !('path' in content.space) ||
        typeof content.space.path !== 'string' ||
        !('charts' in content) ||
        !Array.isArray(content.charts) ||
        !('dashboard' in content) ||
        !content.dashboard ||
        typeof content.dashboard !== 'object'
    ) {
        throw new Error('Playground content bundle is invalid');
    }
    return {
        explores: explores as (Explore | ExploreError)[],
        content: content as PlaygroundContent,
    };
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
    trigger = 'invite_expert',
    hasActiveAgentOnboardingRun,
    playgroundDataDirectory,
    validatePlaygroundDatabase = validatePlaygroundDatabaseBundle,
}: ProvisionPlaygroundProjectArguments): Promise<EnsurePlaygroundProjectResults> => {
    const { organizationUuid } = user;
    if (!organizationUuid) {
        throw new ForbiddenError('User is not part of an organization');
    }

    const featureFlag = await featureFlagService.get({
        user,
        featureFlagId: FeatureFlags.NewOnboarding,
    });
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
    if (!featureFlag.enabled) {
        trackSkipped('new_onboarding_flag_disabled', null);
        throw new NotFoundError('Playground projects are not available');
    }

    let lastKnownProjectUuid: string | null = null;
    try {
        return await onboardingModel.runInPlaygroundProvisioningLock(
            organizationUuid,
            async () => {
                const dataDirectory = path.resolve(
                    playgroundDataDirectory ??
                        process.env.PLAYGROUND_DATA_DIR ??
                        path.join(__dirname, '../../../../assets/playground'),
                );
                const projects =
                    await projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );
                const accessibleProjects = projects.filter(canViewProject);
                const playground = accessibleProjects.find(
                    (project) => project.provisioningSource === 'playground',
                );
                if (playground) {
                    lastKnownProjectUuid = playground.projectUuid;
                    const { explores, content } = await loadPlaygroundBundle(
                        dataDirectory,
                        validatePlaygroundDatabase,
                    );
                    await projectModel.saveExploresToCache(
                        playground.projectUuid,
                        explores,
                        true,
                    );
                    try {
                        await seedPlaygroundContent({
                            projectUuid: playground.projectUuid,
                            user,
                            content,
                        });
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
                if (projects.length > 0 && !isWaitingOnRun) {
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

                const onboarding =
                    await onboardingModel.getByOrganizationUuid(
                        organizationUuid,
                    );
                if (onboarding.playgroundProjectDeletedAt) {
                    trackSkipped('playground_previously_removed', null);
                    throw new NotFoundError(
                        'Playground project was previously removed',
                    );
                }

                const { explores, content } = await loadPlaygroundBundle(
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
                            dataset: 'jaffle_shop',
                        },
                    },
                    RequestMethod.BACKEND,
                    { source: 'playground' },
                );
                const { projectUuid } = creation.project;
                lastKnownProjectUuid = projectUuid;

                try {
                    await projectModel.saveExploresToCache(
                        projectUuid,
                        explores,
                        true,
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
                    });
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
