import type {
    Dashboard,
    DashboardTile,
    PromotionChanges,
    SavedChart,
} from '..';

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
    | 'updatedAt' // Not modifiable by user, but useful to know if it has been updated
> & {
    dashboardSlug: string | undefined;
    version: number;
    spaceSlug: string; // Charts within dashboards will be pointing to spaceSlug of the dashboard by design
    downloadedAt?: Date; // Not modifiable by user, but useful to know if it has been updated
};

export type ApiChartAsCodeListResponse = {
    status: 'ok';
    results: {
        charts: ChartAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    };
};

export type ApiChartAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};

export type DashboardTileWithoutUuids = Omit<
    DashboardTile,
    'properties' | 'uuid'
> & {
    uuid: DashboardTile['uuid'] | undefined; // Allows us to remove the uuid from the object
    properties: Omit<
        DashboardTile['properties'],
        'savedChartUuid' | 'savedSqlUuid' | 'savedSemanticViewerChartUuid'
    >;
};

export type DashboardAsCode = Pick<
    Dashboard,
    'name' | 'description' | 'updatedAt' | 'filters' | 'tabs' | 'slug'
> & {
    tiles: DashboardTileWithoutUuids[];
    version: number;
    spaceSlug: string;
    downloadedAt?: Date;
};

export type ApiDashboardAsCodeListResponse = {
    status: 'ok';
    results: {
        dashboards: DashboardAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    };
};
export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};
