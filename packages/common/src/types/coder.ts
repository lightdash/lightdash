import type { Dashboard, PromotionChanges, SavedChart } from '..';

export const currentVersion = 1;
// We want to only use properties that can be modified by the user
// We'll be using slug to access these charts, so uuids are not included
// These are not linked to a project or org, so projectUuid is not included
export type ChartAsCode = Pick<
    SavedChart,
    | 'name'
    | 'description'
    | 'tableName'
    | 'metricQuery'
    | 'chartConfig'
    | 'tableConfig'
    | 'slug'
    | 'dashboardUuid'
    | 'updatedAt' // Not modifiable by user, but useful to know if it has been updated
> & {
    version: number;
    spaceSlug: string; // Charts within dashboards will be pointing to spaceSlug of the dashboard by design
    downloadedAt?: Date; // Not modifiable by user, but useful to know if it has been updated
};

export type ApiChartAsCodeListResponse = {
    status: 'ok';
    results: ChartAsCode[];
};

export type ApiChartAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};

export type DashboardAsCode = Pick<
    Dashboard,
    'name' | 'description' | 'updatedAt' | 'tiles' | 'filters' | 'tabs' | 'slug'
> & {
    version: number;
    spaceSlug: string;
    downloadedAt?: Date;
};

export type ApiDashboardAsCodeListResponse = {
    status: 'ok';
    results: DashboardAsCode[];
};
export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};
