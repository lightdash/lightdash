import { type PartialDeep } from 'type-fest';
import type {
    ChartAsCodeLanguageMap,
    Dashboard,
    DashboardAsCodeLanguageMap,
    DashboardChartTileProperties,
    DashboardFilterRule,
    DashboardFilters,
    DashboardHeadingTileProperties,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
    DashboardTile,
    PromotionChanges,
    SavedChart,
    SqlChart,
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
    | 'pivotConfig'
    | 'slug'
    | 'parameters'
> & {
    /** Not modifiable by user, but useful to know if it has been updated. Defaults to now if omitted. */
    updatedAt?: Date;
    /** Table configuration. Defaults to empty column order if omitted. */
    tableConfig?: { columnOrder: string[] };
    /** Slug of the dashboard this chart belongs to (if any) */
    dashboardSlug: string | undefined;
    /** Schema version for this chart configuration */
    version: number;
    /** Slug of the space containing this chart */
    spaceSlug: string;
    /** Timestamp when this chart was downloaded from Lightdash */
    downloadedAt?: Date;
};

// SQL Charts are stored separately from regular saved charts
// They have SQL queries instead of metricQuery/tableName
export type SqlChartAsCode = Pick<
    SqlChart,
    'name' | 'description' | 'slug' | 'sql' | 'limit' | 'config' | 'chartKind'
> & {
    version: number;
    spaceSlug: string;
    updatedAt?: Date;
    downloadedAt?: Date;
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

export type ApiSqlChartAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};

export type ApiSqlChartAsCodeListResponse = {
    status: 'ok';
    results: {
        sqlCharts: SqlChartAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    };
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
        | DashboardLoomTileProperties['properties']
        | DashboardHeadingTileProperties['properties'];
};

export type DashboardTileWithSlug = DashboardTile & {
    tileSlug: string | undefined;
};

export type DashboardAsCode = Pick<
    Dashboard,
    'name' | 'description' | 'tabs' | 'slug'
> & {
    /** Not modifiable by user, but useful to know if it has been updated. Defaults to now if omitted. */
    updatedAt?: Date;
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
