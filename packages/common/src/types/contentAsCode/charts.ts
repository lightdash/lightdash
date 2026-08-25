import type { PartialDeep } from 'type-fest';
import type { ChartAsCodeLanguageMap } from '../../utils/i18n/chartAsCode';
import type { ContentVerificationInfo } from '../contentVerification';
import type { MetricQuery } from '../metricQuery';
import type { PromotionChanges } from '../promotion';
import type {
    BigNumberConfig,
    CartesianChartConfig,
    ChartType,
    CustomVisConfig,
    DataAppVizChart,
    FunnelChartConfig,
    GaugeChartConfig,
    MapChartConfig,
    PieChartConfig,
    SankeyChartConfig,
    SavedChart,
    TableChartConfig,
    TreemapChartConfig,
} from '../savedCharts';
import type { SqlChart } from '../sqlRunner';
import type { ContentAsCodeType, FiltersInput } from './core';
import type { SpaceAsCode } from './spaces';

/**
 * The as-code shape of a custom chart type binding. Files carry the viz's
 * project-scoped slug — portable across projects/instances — and upload
 * resolves it to the target project's viz uuid. Exactly one identity is
 * present: `dataAppVizSlug` in every file written today; `dataAppVizUuid`
 * only in legacy files that predate slugs (accepted on upload, never
 * emitted).
 */
export type DataAppVizChartAsCode = Omit<DataAppVizChart, 'dataAppVizUuid'> & {
    dataAppVizSlug?: string;
    dataAppVizUuid?: string;
};

export type DataAppVizChartConfigAsCode = {
    type: ChartType.DATA_APP_VIZ;
    config?: DataAppVizChartAsCode;
};

/**
 * ChartConfig as serialized in chart YAML: viz bindings are slug-based.
 * Enumerated rather than Exclude<ChartConfig, DataAppVizChartConfig> —
 * TSOA cannot resolve Exclude over object unions, which corrupts the
 * generated chart-as-code JSON schema. Keep in sync with ChartConfig.
 */
export type ChartAsCodeConfig =
    | BigNumberConfig
    | CartesianChartConfig
    | CustomVisConfig
    | PieChartConfig
    | FunnelChartConfig
    | TableChartConfig
    | TreemapChartConfig
    | GaugeChartConfig
    | MapChartConfig
    | SankeyChartConfig
    | DataAppVizChartConfigAsCode;

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
    'metricQuery' | 'chartConfig'
> & {
    metricQuery: Omit<MetricQuery, 'filters'> & { filters: FiltersInput };
    chartConfig: ChartAsCodeConfig;
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
