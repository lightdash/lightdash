import {
    ConflictError,
    DashboardTileTypes,
    NotFoundError,
    type SessionUser,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { analyticsSampleDashboards } from '../analytics/systemExplores/sampleContent';
import { type LightdashConfig } from '../config/parseConfig';
import { acquireProjectSlugLock } from '../utils/SlugUtils';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { SavedChartModel } from './SavedChartModel';
import { SpaceModel } from './SpaceModel';

export class AnalyticsContentModel {
    constructor(
        private readonly args: {
            database: Knex;
            lightdashConfig: LightdashConfig;
        },
    ) {}

    /** Sync replaces managed content atomically without changing its identity. */
    async install(projectUuid: string, user: SessionUser): Promise<void> {
        await this.args.database.transaction(async (trx) => {
            // Also serialize callers that do not hold the org provisioning lock.
            const project = await trx('projects')
                .where({
                    project_uuid: projectUuid,
                    provisioning_source: 'analytics',
                })
                .forUpdate()
                .first();
            const organization =
                project &&
                (await trx('organizations')
                    .where({
                        organization_id: project.organization_id,
                        organization_uuid: user.organizationUuid,
                    })
                    .first());
            if (!organization)
                throw new NotFoundError('Analytics project not found');
            const spaceModel = new SpaceModel({ database: trx });
            const dashboardModel = new DashboardModel({ database: trx });
            const savedChartModel = new SavedChartModel({
                database: trx,
                lightdashConfig: this.args.lightdashConfig,
            });
            // Keep all managed dashboards in the same atomic sync.
            /* eslint-disable no-await-in-loop */
            for (const bundle of analyticsSampleDashboards) {
                // Built-in slugs identify sync targets within this project.
                // Reserve these slugs for managed content, including future bundles.
                await acquireProjectSlugLock(trx, projectUuid, bundle.key);
                const existing = await trx('dashboards')
                    .where({ project_uuid: projectUuid, slug: bundle.key })
                    .forUpdate()
                    .first();
                let dashboardUuid: string;
                if (existing) {
                    dashboardUuid = existing.dashboard_uuid;
                    if (existing.project_uuid !== projectUuid)
                        throw new ConflictError(
                            'Sample dashboard belongs to another project',
                        );
                    const space = await trx('spaces')
                        .where({
                            space_id: existing.space_id,
                            project_id: project.project_id,
                        })
                        .whereNull('deleted_at')
                        .first();
                    if (!space)
                        throw new NotFoundError(
                            'Restore the sample dashboard space before syncing',
                        );
                    await trx('dashboards')
                        .where({
                            dashboard_uuid: dashboardUuid,
                            project_uuid: projectUuid,
                        })
                        .update({
                            deleted_at: null,
                            deleted_by_user_uuid: null,
                        });
                    await dashboardModel.update(dashboardUuid, {
                        name: bundle.name,
                        description: bundle.description,
                    });
                } else {
                    const space = await spaceModel.createSpace(
                        {
                            name: bundle.name,
                            inheritParentPermissions: true,
                            parentSpaceUuid: null,
                        },
                        { projectUuid, userId: user.userId, trx },
                    );
                    const created = await dashboardModel.create(
                        space.uuid,
                        {
                            name: bundle.name,
                            description: bundle.description,
                            slug: bundle.key,
                            tiles: [],
                            tabs: [],
                        },
                        user,
                        projectUuid,
                    );
                    if (created.slug !== bundle.key)
                        throw new ConflictError(
                            'Sample dashboard slug is reserved',
                        );
                    dashboardUuid = created.uuid;
                }
                const chartUuids: Record<string, string> = {};
                for (const { key, ...definition } of bundle.charts) {
                    const chartSlug = `${bundle.key}-${key}`;
                    await acquireProjectSlugLock(trx, projectUuid, chartSlug);
                    // Serialize writes on the transaction's single connection.
                    const existingChart = await trx('saved_queries')
                        .where({ project_uuid: projectUuid, slug: chartSlug })
                        .forUpdate()
                        .first();
                    if (existingChart) {
                        const chartUuid = existingChart.saved_query_uuid;
                        if (
                            existingChart.project_uuid !== projectUuid ||
                            existingChart.dashboard_uuid !== dashboardUuid ||
                            existingChart.space_id !== null
                        )
                            throw new ConflictError(
                                'Sample chart was moved out of its managed dashboard',
                            );
                        if (existingChart.deleted_at)
                            await savedChartModel.restore(chartUuid);
                        await savedChartModel.update(chartUuid, {
                            name: definition.name,
                            description: definition.description,
                        });
                        await savedChartModel.createVersion(
                            chartUuid,
                            definition,
                            user,
                            trx,
                        );
                        chartUuids[key] = chartUuid;
                    } else {
                        const created = await savedChartModel.create(
                            projectUuid,
                            user.userUuid,
                            {
                                ...definition,
                                slug: chartSlug,
                                dashboardUuid,
                                updatedByUser: {
                                    userUuid: user.userUuid,
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                },
                            },
                        );
                        // Historical chart aliases can reserve a slug even when no
                        // canonical row exists. Roll back rather than create a new
                        // suffixed chart on every sync or overwrite another owner.
                        if (created.slug !== chartSlug)
                            throw new ConflictError(
                                'Sample chart slug is reserved',
                            );
                        chartUuids[key] = created.uuid;
                    }
                }
                await dashboardModel.addVersion(
                    dashboardUuid,
                    {
                        tabs: [],
                        filters: {
                            dimensions: [],
                            metrics: [],
                            tableCalculations: [],
                        },
                        tiles: bundle.charts.map(({ key }, index) => {
                            let width = index < 4 ? 9 : 18;
                            if (
                                index >= 4 &&
                                index === bundle.charts.length - 1 &&
                                index % 2 === 0
                            )
                                width = 36;
                            return {
                                type: DashboardTileTypes.SAVED_CHART,
                                x:
                                    index < 4
                                        ? index * 9
                                        : ((index - 4) % 2) * 18,
                                y:
                                    index < 4
                                        ? 0
                                        : 3 + Math.floor((index - 4) / 2) * 8,
                                w: width,
                                h: index < 4 ? 3 : 8,
                                tabUuid: null,
                                properties: { savedChartUuid: chartUuids[key] },
                            };
                        }),
                    },
                    user,
                    projectUuid,
                    trx,
                );
            }
            /* eslint-enable no-await-in-loop */
        });
    }
}
