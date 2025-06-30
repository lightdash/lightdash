import { type PartialDeep } from 'type-fest';
import type {
    ChartAsCodeLanguageMap,
    Dashboard,
    DashboardAsCodeLanguageMap,
    DashboardChartTileProperties,
    DashboardFilterRule,
    DashboardFilters,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
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
    | 'pivotConfig'
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
        languageMap:
            | Array<
                  | PartialDeep<
                        ChartAsCodeLanguageMap,
                        { recurseIntoArrays: true }
                    >
                  | undefined
              >
            | undefined;
        missingIds: string[];
        total: number;
        offset: number;
    };
};

export type ApiChartAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};

export type DashboardTileAsCode = Omit<DashboardTile, 'properties' | 'uuid'> & {
    uuid: DashboardTile['uuid'] | undefined; // Allows us to remove the uuid from the object
    tileSlug: string | undefined;
    properties:
        | Pick<
              DashboardChartTileProperties['properties'],
              'title' | 'hideTitle' | 'chartSlug' | 'chartName'
          >
        | DashboardMarkdownTileProperties['properties']
        | DashboardLoomTileProperties['properties'];
};

export type DashboardAsCode = Pick<
    Dashboard,
    'name' | 'description' | 'updatedAt' | 'tabs' | 'slug'
> & {
    tiles: DashboardTileAsCode[];
    version: number;
    spaceSlug: string;
    downloadedAt?: Date;
    filters: Omit<DashboardFilters, 'dimensions'> & {
        dimensions: Omit<DashboardFilterRule, 'id'>[];
    };
};

export type ApiDashboardAsCodeListResponse = {
    status: 'ok';
    results: {
        dashboards: DashboardAsCode[];
        languageMap:
            | Array<
                  | PartialDeep<
                        DashboardAsCodeLanguageMap,
                        { recurseIntoArrays: true }
                    >
                  | undefined
              >
            | undefined;
        missingIds: string[];
        total: number;
        offset: number;
    };
};
export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};
