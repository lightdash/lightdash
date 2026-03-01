import { type PartialDeep } from 'type-fest';
import type {
    ChartAsCodeLanguageMap,
    Dashboard,
    DashboardAsCodeLanguageMap,
    DashboardChartTileProperties,
    DashboardFilterRule,
    DashboardHeadingTileProperties,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
    DashboardTile,
    FilterRule,
    MetricQuery,
    PromotionChanges,
    SavedChart,
    SqlChart,
} from '..';
import type { ContentVerificationInfo } from './contentVerification';

export const currentVersion = 1;

/**
 * Permissive filter types for chart-as-code uploads where `id` may be omitted.
 * Filter IDs are auto-generated during upsert if absent.
 * After normalization these become the strict runtime types (FilterGroup, Filters).
 */
export type FilterRuleInput = Omit<FilterRule, 'id'> & { id?: string };
export type OrFilterGroupInput = {
    id?: string;
    or: Array<FilterGroupItemInput>;
};
export type AndFilterGroupInput = {
    id?: string;
    and: Array<FilterGroupItemInput>;
};
export type FilterGroupInput = OrFilterGroupInput | AndFilterGroupInput;
export type FilterGroupItemInput = FilterGroupInput | FilterRuleInput;
export type FiltersInput = {
    dimensions?: FilterGroupInput;
    metrics?: FilterGroupInput;
    tableCalculations?: FilterGroupInput;
};

// We want to only use properties that can be modified by the user
// We'll be using slug to access these charts, so uuids are not included
// These are not linked to a project or org, so projectUuid is not included
export type ChartAsCode = Omit<
    Pick<
        SavedChart,
        | 'name'
        | 'description'
        | 'tableName'
        | 'metricQuery'
        | 'chartConfig'
        | 'pivotConfig'
        | 'slug'
        | 'parameters'
    >,
    'metricQuery'
> & {
    metricQuery: Omit<MetricQuery, 'filters'> & { filters: FiltersInput };
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
    /** Verification status of this chart. Read-only; ignored on upload. */
    verification?: ContentVerificationInfo | null;
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
    filters?: {
        dimensions?: Omit<DashboardFilterRule, 'id'>[];
        metrics?: DashboardFilterRule[];
        tableCalculations?: DashboardFilterRule[];
    };
    /** Verification status of this dashboard. Read-only; ignored on upload. */
    verification?: ContentVerificationInfo | null;
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
