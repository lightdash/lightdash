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
    type SessionUser,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import fs from 'fs/promises';
import path from 'path';
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import Logger from '../../../logging/logger';
import { type OnboardingModel } from '../../../models/OnboardingModel/OnboardingModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type CatalogService } from '../../../services/CatalogService/CatalogService';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';

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
    analytics: Pick<LightdashAnalytics, 'track'>;
    canViewProject: (project: OrganizationProject) => boolean;
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
): Promise<(Explore | ExploreError)[]> => {
    const [exploresJson] = await Promise.all([
        fs.readFile(path.join(dataDirectory, 'explores.json'), 'utf8'),
        validatePlaygroundDatabase(
            path.join(dataDirectory, 'jaffle_shop.duckdb'),
        ),
    ]);
    const explores: unknown = JSON.parse(exploresJson);
    if (!Array.isArray(explores)) {
        throw new Error('Playground explores bundle must contain an array');
    }
    return explores as (Explore | ExploreError)[];
};

export const provisionPlaygroundProject = async ({
    user,
    featureFlagService,
    projectModel,
    onboardingModel,
    projectService,
    catalogService,
    analytics,
    canViewProject,
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
    if (!featureFlag.enabled) {
        throw new NotFoundError('Playground projects are not available');
    }

    return onboardingModel.runInPlaygroundProvisioningLock(
        organizationUuid,
        async () => {
            const dataDirectory = path.resolve(
                playgroundDataDirectory ??
                    process.env.PLAYGROUND_DATA_DIR ??
                    path.join(__dirname, '../../../../assets/playground'),
            );
            const projects =
                await projectModel.getAllByOrganizationUuid(organizationUuid);
            const accessibleProjects = projects.filter(canViewProject);
            const playground = accessibleProjects.find(
                (project) => project.provisioningSource === 'playground',
            );
            if (playground) {
                const explores = await loadPlaygroundBundle(
                    dataDirectory,
                    validatePlaygroundDatabase,
                );
                await projectModel.saveExploresToCache(
                    playground.projectUuid,
                    explores,
                );
                return {
                    projectUuid: playground.projectUuid,
                    created: false,
                };
            }
            if (projects.length > 0) {
                const existingProject = accessibleProjects[0];
                if (!existingProject) {
                    throw new ForbiddenError(
                        'User does not have permission to view an existing project',
                    );
                }
                return {
                    projectUuid: existingProject.projectUuid,
                    created: false,
                };
            }

            const onboarding =
                await onboardingModel.getByOrganizationUuid(organizationUuid);
            if (onboarding.playgroundProjectDeletedAt) {
                throw new NotFoundError(
                    'Playground project was previously removed',
                );
            }

            const explores = await loadPlaygroundBundle(
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

            try {
                await projectModel.saveExploresToCache(projectUuid, explores);
            } catch (error) {
                await projectModel.delete(projectUuid).catch((cleanupError) => {
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

            try {
                await catalogService.indexCatalog(projectUuid, user.userUuid);
            } catch (error) {
                Sentry.captureException(error);
                Logger.error(
                    `Failed to index playground catalog for project ${projectUuid}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }

            analytics.track({
                event: 'playground_project.provisioned',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    trigger: 'invite_expert',
                },
            });
            return { projectUuid, created: true };
        },
    );
};
