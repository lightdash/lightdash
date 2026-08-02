import {
    SchedulerFormat,
    ThresholdOperator,
    type AppScheduler,
    type ChartScheduler,
    type DashboardScheduler,
    type SchedulerAndTargets,
    type SqlChartScheduler,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getItemLink, getSchedulerLink } from './SchedulersViewUtils';

const PROJECT_UUID = 'project-1';

/** A scheduler variant plus the targets every SchedulerItem carries. */
type Fixture<T> = T & Pick<SchedulerAndTargets, 'targets'>;

const base = {
    schedulerUuid: 'scheduler-1',
    slug: 'weekly-delivery',
    name: 'Weekly delivery',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: 'user-1',
    createdByName: 'Jane',
    format: SchedulerFormat.CSV,
    cron: '0 9 * * 1',
    savedChartName: null,
    dashboardName: null,
    savedSqlName: null,
    appName: null,
    options: { formatted: true, limit: 'table' as const },
    enabled: true,
    includeLinks: true,
    projectUuid: PROJECT_UUID,
    targets: [],
};

const chartScheduler: Fixture<ChartScheduler> = {
    ...base,
    savedChartUuid: 'chart-1',
    dashboardUuid: null,
    savedSqlUuid: null,
    appUuid: null,
};

const dashboardScheduler: Fixture<DashboardScheduler> = {
    ...base,
    savedChartUuid: null,
    dashboardUuid: 'dashboard-1',
    savedSqlUuid: null,
    appUuid: null,
    selectedTabs: null,
};

const sqlChartScheduler: Fixture<SqlChartScheduler> = {
    ...base,
    savedChartUuid: null,
    dashboardUuid: null,
    savedSqlUuid: 'sql-chart-1',
    appUuid: null,
};

const appScheduler: Fixture<AppScheduler> = {
    ...base,
    savedChartUuid: null,
    dashboardUuid: null,
    savedSqlUuid: null,
    appUuid: 'app-1',
};

describe('getSchedulerLink', () => {
    it('links an app scheduler to the app, not the dashboard route', () => {
        expect(getSchedulerLink(appScheduler)).toBe(
            `/projects/${PROJECT_UUID}/apps/app-1/view?scheduler_uuid=scheduler-1`,
        );
    });

    it('links chart, sql chart and dashboard schedulers to their own routes', () => {
        expect(getSchedulerLink(chartScheduler)).toBe(
            `/projects/${PROJECT_UUID}/saved/chart-1/view/?scheduler_uuid=scheduler-1`,
        );
        expect(getSchedulerLink(sqlChartScheduler)).toBe(
            `/projects/${PROJECT_UUID}/sql-runner/sql-chart-1?scheduler_uuid=scheduler-1`,
        );
        expect(getSchedulerLink(dashboardScheduler)).toBe(
            `/projects/${PROJECT_UUID}/dashboards/dashboard-1/view/?scheduler_uuid=scheduler-1`,
        );
    });

    it('appends the sync param for Google Sheets app deliveries', () => {
        expect(
            getSchedulerLink({
                ...appScheduler,
                format: SchedulerFormat.GSHEETS,
            }),
        ).toBe(
            `/projects/${PROJECT_UUID}/apps/app-1/view?scheduler_uuid=scheduler-1&isSync=true`,
        );
    });

    it('uses the threshold param for app alerts', () => {
        expect(
            getSchedulerLink({
                ...appScheduler,
                thresholds: [
                    {
                        operator: ThresholdOperator.GREATER_THAN,
                        fieldId: 'revenue',
                        value: 1,
                    },
                ],
            }),
        ).toBe(
            `/projects/${PROJECT_UUID}/apps/app-1/view?threshold_uuid=scheduler-1`,
        );
    });

    it('falls back to the provided project uuid when the item has none', () => {
        expect(
            getSchedulerLink(
                { ...appScheduler, projectUuid: null },
                'fallback-project',
            ),
        ).toBe(
            `/projects/fallback-project/apps/app-1/view?scheduler_uuid=scheduler-1`,
        );
    });
});

describe('getItemLink', () => {
    it('links an app scheduler to the app, not the dashboard route', () => {
        expect(getItemLink(appScheduler)).toBe(
            `/projects/${PROJECT_UUID}/apps/app-1/view`,
        );
    });

    it('links chart, sql chart and dashboard schedulers to their own routes', () => {
        expect(getItemLink(chartScheduler)).toBe(
            `/projects/${PROJECT_UUID}/saved/chart-1/view`,
        );
        expect(getItemLink(sqlChartScheduler)).toBe(
            `/projects/${PROJECT_UUID}/sql-runner/sql-chart-1`,
        );
        expect(getItemLink(dashboardScheduler)).toBe(
            `/projects/${PROJECT_UUID}/dashboards/dashboard-1/view`,
        );
    });
});
