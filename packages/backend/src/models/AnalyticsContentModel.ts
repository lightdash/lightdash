import {
    ConflictError,
    DashboardTileTypes,
    NotFoundError,
    type SessionUser,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { v5 as uuidv5 } from 'uuid';
import { analyticsSampleContent } from '../analytics/systemExplores/sampleContent';
import { type LightdashConfig } from '../config/parseConfig';
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

    /** Refresh replaces managed content atomically without changing its identity. */
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
            const bundle = analyticsSampleContent;
            // These IDs are server-only creation arguments, never client input.
            // Copies receive random IDs and cannot become refresh targets.
            const dashboardUuid = uuidv5(
                `lightdash-analytics/${projectUuid}/${bundle.key}`,
                uuidv5.URL,
            );
            const existing = await trx('dashboards')
                .where('dashboard_uuid', dashboardUuid)
                .forUpdate()
                .first();
            if (existing) {
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
                        'Restore the sample dashboard space before refreshing',
                    );
                await trx('dashboards')
                    .where({
                        dashboard_uuid: dashboardUuid,
                        project_uuid: projectUuid,
                    })
                    .update({ deleted_at: null, deleted_by_user_uuid: null });
                await dashboardModel.update(dashboardUuid, {
                    name: bundle.name,
                    description: bundle.description,
                });
            } else {
                const space = await spaceModel.createSpace(
                    {
                        name: 'Lightdash analytics samples',
                        inheritParentPermissions: true,
                        parentSpaceUuid: null,
                    },
                    { projectUuid, userId: user.userId, trx },
                );
                await dashboardModel.create(
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
                    dashboardUuid,
                );
            }
            const chartUuids: Record<string, string> = {};
            for (const { key, ...definition } of bundle.charts) {
                const chartUuid = uuidv5(key, dashboardUuid);
                // Serialize writes on the transaction's single connection.
                /* eslint-disable no-await-in-loop */
                const existingChart = await trx('saved_queries')
                    .where('saved_query_uuid', chartUuid)
                    .forUpdate()
                    .first();
                if (existingChart) {
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
                } else {
                    await savedChartModel.create(
                        projectUuid,
                        user.userUuid,
                        {
                            ...definition,
                            slug: `${bundle.key}-${key}`,
                            dashboardUuid,
                            updatedByUser: {
                                userUuid: user.userUuid,
                                firstName: user.firstName,
                                lastName: user.lastName,
                            },
                        },
                        chartUuid,
                    );
                }
                /* eslint-enable no-await-in-loop */
                chartUuids[key] = chartUuid;
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
                    tiles: bundle.charts.map(({ key }, index) => ({
                        type: DashboardTileTypes.SAVED_CHART,
                        x: index < 4 ? index * 9 : ((index - 4) % 2) * 18,
                        y: index < 4 ? 0 : 3 + Math.floor((index - 4) / 2) * 8,
                        w: index < 4 ? 9 : 18,
                        h: index < 4 ? 3 : 8,
                        tabUuid: null,
                        properties: { savedChartUuid: chartUuids[key] },
                    })),
                },
                user,
                projectUuid,
                trx,
            );
        });
    }
}
