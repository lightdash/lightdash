import {
    DashboardTileTypes,
    NotFoundError,
    type SessionUser,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { analyticsSampleContent } from '../analytics/systemExplores/sampleContent';
import { type LightdashConfig } from '../config/parseConfig';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { SavedChartModel } from './SavedChartModel';
import { SpaceModel } from './SpaceModel';

const TABLE = 'analytics_content_installations';
type Installation = {
    project_uuid: string;
    bundle_key: string;
    bundle_version: number;
    dashboard_uuid: string | null;
    chart_uuids: Record<string, string>;
    installed_at: Date;
};

export class AnalyticsContentModel {
    constructor(
        private readonly args: {
            database: Knex;
            lightdashConfig: LightdashConfig;
        },
    ) {}

    async get(projectUuid: string): Promise<Installation | undefined> {
        return this.args
            .database<Installation>(TABLE)
            .where('project_uuid', projectUuid)
            .first();
    }

    /** All content and the registry commit together, so failures can be retried. */
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
            if (await trx(TABLE).where('project_uuid', projectUuid).first())
                return;

            const spaceModel = new SpaceModel({ database: trx });
            const dashboardModel = new DashboardModel({ database: trx });
            const savedChartModel = new SavedChartModel({
                database: trx,
                lightdashConfig: this.args.lightdashConfig,
            });
            const bundle = analyticsSampleContent;
            const space = await spaceModel.createSpace(
                {
                    name: 'Lightdash analytics samples',
                    inheritParentPermissions: true,
                    parentSpaceUuid: null,
                },
                { projectUuid, userId: user.userId, trx },
            );
            const dashboard = await dashboardModel.create(
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
            const chartUuids: Record<string, string> = {};
            for (const { key, ...definition } of bundle.charts) {
                // Use the transaction's single connection sequentially; a failure
                // must stop writes before the transaction is rolled back.
                // eslint-disable-next-line no-await-in-loop
                const saved = await savedChartModel.create(
                    projectUuid,
                    user.userUuid,
                    {
                        ...definition,
                        slug: `${bundle.key}-${key}`,
                        dashboardUuid: dashboard.uuid,
                        updatedByUser: {
                            userUuid: user.userUuid,
                            firstName: user.firstName,
                            lastName: user.lastName,
                        },
                    },
                );
                chartUuids[key] = saved.uuid;
            }
            await dashboardModel.addVersion(
                dashboard.uuid,
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
                        y: index < 4 ? 0 : 4 + Math.floor((index - 4) / 2) * 9,
                        w: index < 4 ? 9 : 18,
                        h: index < 4 ? 4 : 9,
                        tabUuid: null,
                        properties: { savedChartUuid: chartUuids[key] },
                    })),
                },
                user,
                projectUuid,
                trx,
            );
            await trx(TABLE).insert({
                project_uuid: projectUuid,
                bundle_key: bundle.key,
                bundle_version: bundle.version,
                dashboard_uuid: dashboard.uuid,
                chart_uuids: chartUuids,
            });
        });
    }
}
