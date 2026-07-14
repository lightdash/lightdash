import { type PartialDeep } from 'type-fest';
import type {
    ChartAsCodeLanguageMap,
    Dashboard,
    DashboardAsCodeLanguageMap,
    DashboardChartTileProperties,
    DashboardDataAppTileProperties,
    DashboardFilterRule,
    DashboardHeadingTileProperties,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
    DashboardSqlChartTileProperties,
    DashboardTab,
    DashboardTile,
    DashboardTileTypes,
    FilterRule,
    MetricQuery,
    NotificationFrequency,
    ParametersValuesMap,
    PromotionChanges,
    ResultColumn,
    SavedChart,
    SchedulerCsvOptions,
    SchedulerFormat,
    SchedulerImageOptions,
    SchedulerPdfOptions,
    SqlChart,
    ThresholdOptions,
} from '..';
import type { ContentVerificationInfo } from './contentVerification';
import type { PromotionAction } from './promotion';

export const currentVersion = 1;

export enum ContentAsCodeType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SQL_CHART = 'sql_chart',
    SPACE = 'space',
    SCHEDULED_DELIVERY = 'scheduled_delivery',
    ALERT = 'alert',
    GOOGLE_SHEETS_SYNC = 'google_sheets_sync',
    VIRTUAL_VIEW = 'virtual_view',
}

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
    /** Content type discriminator */
    contentType?: ContentAsCodeType.CHART;
    /** Slug of the space containing this chart */
    spaceSlug: string;
    /** Timestamp when this chart was downloaded from Lightdash */
    downloadedAt?: Date;
    /**
     * Declarative verification state.
     * `true` verifies the chart on upload, `false` unverifies it, `undefined` leaves the
     * current state untouched. Download sets this to `true` when the chart is verified.
     */
    verified?: boolean;
    /** Detailed verification info (who/when). Read-only; ignored on upload. */
    verification?: ContentVerificationInfo | null;
};

// SQL Charts are stored separately from regular saved charts
// They have SQL queries instead of metricQuery/tableName
export type SqlChartAsCode = Pick<
    SqlChart,
    'name' | 'description' | 'slug' | 'sql' | 'limit' | 'config' | 'chartKind'
> & {
    version: number;
    contentType?: ContentAsCodeType.SQL_CHART;
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
        spaces: SpaceAsCode[];
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
        spaces: SpaceAsCode[];
        total: number;
        offset: number;
    };
};

type DashboardTileAsCodeBase = {
    uuid: DashboardTile['uuid'] | undefined;
    tileSlug: string | undefined;
    type: DashboardTileTypes;
    /**
     * @minimum 0
     * @maximum 35
     */
    x: DashboardTile['x'];
    /**
     * @minimum 0
     */
    y: DashboardTile['y'];
    /**
     * @minimum 1
     */
    h: DashboardTile['h'];
    /**
     * @minimum 1
     * @maximum 36
     */
    w: DashboardTile['w'];
    tabUuid: DashboardTile['tabUuid'];
};

export type DashboardChartTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.SAVED_CHART;
    properties: Pick<
        DashboardChartTileProperties['properties'],
        'title' | 'hideTitle' | 'chartName'
    > & { chartSlug: string | null };
};

export type DashboardSqlChartTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.SQL_CHART;
    properties: Pick<
        DashboardSqlChartTileProperties['properties'],
        'title' | 'hideTitle' | 'chartName'
    > & { chartSlug: string | null };
};

export type DashboardMarkdownTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.MARKDOWN;
    properties: DashboardMarkdownTileProperties['properties'];
};

export type DashboardLoomTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.LOOM;
    properties: DashboardLoomTileProperties['properties'];
};

export type DashboardHeadingTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.HEADING;
    properties: DashboardHeadingTileProperties['properties'];
};

export type DashboardDataAppTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.DATA_APP;
    properties: DashboardDataAppTileProperties['properties'];
};

export type DashboardTileAsCode =
    | DashboardChartTileAsCode
    | DashboardSqlChartTileAsCode
    | DashboardMarkdownTileAsCode
    | DashboardLoomTileAsCode
    | DashboardHeadingTileAsCode
    | DashboardDataAppTileAsCode;

export type DashboardTileWithSlug = DashboardTile & {
    tileSlug: string | undefined;
};

export type DashboardTabAsCode = {
    uuid: DashboardTab['uuid'];
    /**
     * @minLength 1
     */
    name: string;
    /**
     * @minimum 0
     */
    order: number;
    hidden?: DashboardTab['hidden'];
};

export type DashboardAsCode = Omit<
    Pick<
        Dashboard,
        'name' | 'description' | 'tabs' | 'slug' | 'config' | 'parameters'
    >,
    'name' | 'slug' | 'tabs'
> & {
    /**
     * @minLength 1
     */
    name: string;
    /**
     * @pattern ^[a-z0-9-]+$
     */
    slug: string;
    tabs: DashboardTabAsCode[];
    /** Not modifiable by user, but useful to know if it has been updated. Defaults to now if omitted. */
    updatedAt?: Date;
    tiles: DashboardTileAsCode[];
    version: number;
    contentType?: ContentAsCodeType.DASHBOARD;
    spaceSlug: string;
    downloadedAt?: Date;
    filters?: {
        dimensions?: Omit<DashboardFilterRule, 'id'>[];
        metrics?: DashboardFilterRule[];
        tableCalculations?: DashboardFilterRule[];
    };
    /**
     * Declarative verification state.
     * `true` verifies the dashboard on upload, `false` unverifies it, `undefined` leaves the
     * current state untouched. Download sets this to `true` when the dashboard is verified.
     */
    verified?: boolean;
    /** Detailed verification info (who/when). Read-only; ignored on upload. */
    verification?: ContentVerificationInfo | null;
};

export type SpaceAsCode = {
    contentType: ContentAsCodeType.SPACE;
    /** The original human-readable space name (preserves emoji, casing, etc.) */
    spaceName: string;
    /** The space slug used for file naming and cross-referencing */
    slug: string;
};

export type VirtualViewAsCode = {
    contentType: ContentAsCodeType.VIRTUAL_VIEW;
    version: number;
    /** Immutable project-scoped explore name used by downstream content. */
    slug: string;
    /** Mutable display label. */
    name: string;
    sql: string;
    columns: ResultColumn[];
    parameters: ParametersValuesMap | null;
};

export type VirtualViewAsCodeSkip = {
    slug: string;
    reason: string;
};

export type ApiVirtualViewAsCodeListResponse = {
    status: 'ok';
    results: {
        virtualViews: VirtualViewAsCode[];
        skipped: VirtualViewAsCodeSkip[];
        missingSlugs: string[];
    };
};

export type ApiVirtualViewAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};

export type ScheduledDeliveryTargetAsCode =
    | {
          type: 'email';
          recipient: string;
      }
    | {
          type: 'slack';
          channel: string;
      };

export type ScheduledDeliveryFormatAsCode =
    | {
          format: SchedulerFormat.CSV | SchedulerFormat.XLSX;
          options: SchedulerCsvOptions;
      }
    | {
          format: SchedulerFormat.IMAGE;
          options: SchedulerImageOptions;
      }
    | {
          format: SchedulerFormat.PDF;
          options: SchedulerPdfOptions;
      };

type ScheduledDeliveryAsCodeBase = {
    contentType: ContentAsCodeType.SCHEDULED_DELIVERY;
    version: number;
    slug: string;
    name: string;
    message: string | null;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    includeLinks: boolean;
    targets: ScheduledDeliveryTargetAsCode[];
    downloadedAt?: Date;
};

export type ChartScheduledDeliveryAsCode = ScheduledDeliveryFormatAsCode &
    ScheduledDeliveryAsCodeBase & {
        resource: {
            type: 'chart';
            slug: string;
        };
        filters: FiltersInput | null;
        parameters: ParametersValuesMap | null;
        customViewportWidth: null;
        selectedTabs: null;
    };

export type DashboardScheduledDeliveryAsCode = ScheduledDeliveryFormatAsCode &
    ScheduledDeliveryAsCodeBase & {
        resource: {
            type: 'dashboard';
            slug: string;
        };
        filters: Omit<DashboardFilterRule, 'id'>[] | null;
        parameters: ParametersValuesMap | null;
        customViewportWidth: number | null;
        /** Portable dashboard-tab slugs, resolved to UUIDs on upload. */
        selectedTabs: string[] | null;
    };

export type ScheduledDeliveryAsCode =
    | ChartScheduledDeliveryAsCode
    | DashboardScheduledDeliveryAsCode;

export type ScheduledDeliveryAsCodeSkip = {
    name: string;
    reason: string;
};

export type ApiScheduledDeliveryAsCodeListResponse = {
    status: 'ok';
    results: {
        scheduledDeliveries: ScheduledDeliveryAsCode[];
        skipped: ScheduledDeliveryAsCodeSkip[];
    };
};

export type ApiScheduledDeliveryAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};

export type AlertAsCode = {
    contentType: ContentAsCodeType.ALERT;
    version: number;
    slug: string;
    name: string;
    message: string | null;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    includeLinks: boolean;
    targets: ScheduledDeliveryTargetAsCode[];
    resource: {
        type: 'chart';
        slug: string;
    };
    thresholds: ThresholdOptions[];
    notificationFrequency: NotificationFrequency;
    filters: FiltersInput | null;
    parameters: ParametersValuesMap | null;
    downloadedAt?: Date;
};

export type ApiAlertAsCodeListResponse = {
    status: 'ok';
    results: {
        alerts: AlertAsCode[];
        skipped: ScheduledDeliveryAsCodeSkip[];
    };
};

export type ApiAlertAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};

type GoogleSheetsSyncAsCodeBase = {
    contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC;
    version: number;
    slug: string;
    name: string;
    message: string | null;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    includeLinks: boolean;
    destination: {
        spreadsheetId: string;
        spreadsheetName: string;
        organizationName: string;
        url: string;
        tabName: string | null;
    };
    downloadedAt?: Date;
};

export type ChartGoogleSheetsSyncAsCode = GoogleSheetsSyncAsCodeBase & {
    resource: {
        type: 'chart';
        slug: string;
    };
    filters: FiltersInput | null;
    parameters: ParametersValuesMap | null;
    customViewportWidth: null;
    selectedTabs: null;
};

export type DashboardGoogleSheetsSyncAsCode = GoogleSheetsSyncAsCodeBase & {
    resource: {
        type: 'dashboard';
        slug: string;
    };
    filters: Omit<DashboardFilterRule, 'id'>[] | null;
    parameters: ParametersValuesMap | null;
    customViewportWidth: number | null;
    selectedTabs: string[] | null;
};

export type GoogleSheetsSyncAsCode =
    | ChartGoogleSheetsSyncAsCode
    | DashboardGoogleSheetsSyncAsCode;

export type ApiGoogleSheetsSyncAsCodeListResponse = {
    status: 'ok';
    results: {
        googleSheetsSyncs: GoogleSheetsSyncAsCode[];
        skipped: ScheduledDeliveryAsCodeSkip[];
    };
};

export type ApiGoogleSheetsSyncAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
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
        spaces: SpaceAsCode[];
        total: number;
        offset: number;
    };
};
export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};
