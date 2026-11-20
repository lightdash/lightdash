import {
    type ChartAsCode,
    type DashboardAsCode,
    type Explore,
} from '@lightdash/common';
import { createHash } from 'crypto';
import type { LibraryChartBinding } from '../../../analytics/systemExplores/libraryCharts';
import { analyticsDefaultSpace } from '../../../analytics/systemExplores/sampleContent';
import { buildContentAsCodeSnapshot } from '../../../services/CoderService/contentAsCodeSnapshot';
import { analyticsHomepage } from './analyticsHomepage';

export const getAnalyticsContentHash = (
    explores: Explore[],
    bundles: { dashboard: DashboardAsCode; charts: ChartAsCode[] }[],
    bindings: ReadonlyMap<string, LibraryChartBinding>,
): string =>
    createHash('sha256')
        .update(
            JSON.stringify({
                explores,
                space: analyticsDefaultSpace,
                homepage: analyticsHomepage,
                bindings: [...bindings.entries()].sort(([a], [b]) =>
                    a.localeCompare(b),
                ),
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
