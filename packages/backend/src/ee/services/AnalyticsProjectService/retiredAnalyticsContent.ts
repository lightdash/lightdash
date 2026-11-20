import {
    ContentType,
    getErrorMessage,
    getLtreePathFromContentAsCodePath,
    type SessionUser,
} from '@lightdash/common';
import {
    retiredAnalyticsCharts,
    retiredAnalyticsDashboards,
} from '../../../analytics/systemExplores/retiredContent';
import { analyticsDefaultSpace } from '../../../analytics/systemExplores/sampleContent';
import { type LightdashConfig } from '../../../config/parseConfig';
import type { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import type { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import type { SavedChartModel } from '../../../models/SavedChartModel';
import type { SpaceModel } from '../../../models/SpaceModel';
import type { DashboardService } from '../../../services/DashboardService/DashboardService';
import type { SavedChartService } from '../../../services/SavedChartsService/SavedChartService';

export type RetiredContentDependencies = {
    lightdashConfig: Pick<LightdashConfig, 'softDelete'>;
    spaceModel: Pick<SpaceModel, 'find'>;
    dashboardModel: Pick<DashboardModel, 'find'>;
    savedChartModel: Pick<SavedChartModel, 'find'>;
    contentVerificationModel: Pick<
        ContentVerificationModel,
        'getByContentUuids'
    >;
    // The product's own recoverable deletes, with the acting administrator's permissions
    dashboardService: Pick<DashboardService, 'softDelete'>;
    savedChartService: Pick<SavedChartService, 'softDelete'>;
    logger: {
        info: (message: string, details?: object) => void;
        warn: (message: string, details?: object) => void;
    };
};

export type RetiredContentResult = {
    dashboards: string[];
    charts: string[];
};

// Removes managed content that is no longer defined in code from one Analytics project.
//
// An item is removed only when all of this holds:
// - its slug is on the retired list;
// - it is in the space the sync installs managed content into;
// - the dashboard (for a chart: the dashboard it belongs to, which must be the one the list names) is
//   still marked verified, which the sync does on every managed dashboard and a copy does not inherit;
// - it has not been deleted already.
// So a dashboard a customer created, moved elsewhere or duplicated is never touched, and running this
// again does nothing.
//
// The delete is the same one the product uses when a person deletes a dashboard or chart with soft
// delete switched on: it is marked deleted, shows in recently deleted content and can be restored until
// the retention period ends. Where soft delete is switched off there is no delete that can be undone,
// so nothing is removed.
export const removeRetiredAnalyticsContent = async (
    dependencies: RetiredContentDependencies,
    user: SessionUser,
    projectUuid: string,
): Promise<RetiredContentResult> => {
    const removed: RetiredContentResult = { dashboards: [], charts: [] };
    if (!dependencies.lightdashConfig.softDelete.enabled) return removed;

    const spaces = await dependencies.spaceModel.find({
        projectUuid,
        path: getLtreePathFromContentAsCodePath(analyticsDefaultSpace.slug),
    });
    // No managed space, or more than one candidate: nothing here is known to be the sync's own
    if (spaces.length !== 1) return removed;
    const [managedSpace] = spaces;

    const dashboardSlugs = [
        ...new Set([
            ...retiredAnalyticsDashboards,
            ...Object.values(retiredAnalyticsCharts),
        ]),
    ];
    const inManagedSpace = (
        await dependencies.dashboardModel.find({
            projectUuid,
            slugs: dashboardSlugs,
        })
    ).filter(({ spaceUuid }) => spaceUuid === managedSpace.uuid);
    const verified =
        await dependencies.contentVerificationModel.getByContentUuids(
            ContentType.DASHBOARD,
            inManagedSpace.map(({ uuid }) => uuid),
        );
    const managedDashboards = inManagedSpace.filter(({ uuid }) =>
        verified.has(uuid),
    );

    const remove = async (
        kind: 'dashboard' | 'chart',
        slug: string,
        uuid: string,
        softDelete: () => Promise<void>,
    ) => {
        try {
            await softDelete();
            removed[kind === 'dashboard' ? 'dashboards' : 'charts'].push(slug);
            dependencies.logger.info(
                `Removed retired analytics ${kind} (recoverable)`,
                { projectUuid, slug, uuid },
            );
        } catch (error) {
            // One item that cannot be removed must not stop the sync or the other items
            dependencies.logger.warn(
                `Unable to remove retired analytics ${kind}`,
                { projectUuid, slug, uuid, error: getErrorMessage(error) },
            );
        }
    };

    /* eslint-disable no-await-in-loop -- one item at a time, in a fixed order */
    const removedDashboardUuids = new Set<string>();
    for (const dashboard of managedDashboards.filter(({ slug }) =>
        retiredAnalyticsDashboards.includes(slug),
    )) {
        await remove('dashboard', dashboard.slug, dashboard.uuid, () =>
            dependencies.dashboardService.softDelete(user, dashboard.uuid),
        );
        // Its charts are removed with it
        removedDashboardUuids.add(dashboard.uuid);
    }

    const retiredChartSlugs = Object.keys(retiredAnalyticsCharts);
    if (retiredChartSlugs.length > 0) {
        const charts = await dependencies.savedChartModel.find({
            projectUuid,
            slugs: retiredChartSlugs,
        });
        for (const chart of charts) {
            const owner = managedDashboards.find(
                ({ uuid, slug }) =>
                    uuid === chart.dashboardUuid &&
                    slug === retiredAnalyticsCharts[chart.slug],
            );
            if (owner && !removedDashboardUuids.has(owner.uuid)) {
                await remove('chart', chart.slug, chart.uuid, () =>
                    dependencies.savedChartService.softDelete(user, chart.uuid),
                );
            }
        }
    }
    /* eslint-enable no-await-in-loop */
    return removed;
};
