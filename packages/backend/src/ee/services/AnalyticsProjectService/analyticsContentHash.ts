import {
    type ChartAsCode,
    type DashboardAsCode,
    type Explore,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { analyticsDefaultSpace } from '../../../analytics/systemExplores/sampleContent';
import { buildContentAsCodeSnapshot } from '../../../services/CoderService/contentAsCodeSnapshot';

export const getAnalyticsContentHash = (
    explores: Explore[],
    bundles: { dashboard: DashboardAsCode; charts: ChartAsCode[] }[],
): string =>
    createHash('sha256')
        .update(
            JSON.stringify({
                explores,
                space: analyticsDefaultSpace,
                bundles: bundles.map(({ dashboard, charts }) => ({
                    dashboard:
                        buildContentAsCodeSnapshot(dashboard).snapshotHash,
                    charts: charts.map(
                        (chart) =>
                            buildContentAsCodeSnapshot(chart).snapshotHash,
                    ),
                })),
            }),
        )
        .digest('hex');
