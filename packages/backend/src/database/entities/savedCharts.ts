import {
    BinRange,
    ChartConfig,
    ChartKind,
    ChartType,
    CompactOrAlias,
    CustomFormat,
    DBFieldTypes,
    MetricFilterRule,
    MetricType,
    NumberSeparator,
    TimeZone,
} from '@lightdash/common';
import { Knex } from 'knex';

export const SavedChartsTableName = 'saved_queries';
export const SavedChartVersionsTableName = 'saved_queries_versions';

type InsertChartInSpace = Pick<
    DbSavedChart,
    | 'name'
    | 'description'
    | 'last_version_chart_kind'
    | 'last_version_updated_by_user_uuid'
    | 'slug'
> & {
    space_id: number;
    dashboard_uuid: null;
};

type InsertChartInDashboard = Pick<
    DbSavedChart,
    | 'name'
    | 'description'
    | 'last_version_chart_kind'
    | 'last_version_updated_by_user_uuid'
> & {
    space_id: null;
    dashboard_uuid: string;
};

export type InsertChart = InsertChartInSpace | InsertChartInDashboard;

export type SavedChartTable = Knex.CompositeTableType<
    DbSavedChart,
    InsertChart,
    Partial<
        Pick<
            DbSavedChart,
            | 'space_id'
            | 'name'
            | 'description'
            | 'last_version_chart_kind'
            | 'last_version_updated_at'
            | 'last_version_updated_by_user_uuid'
            | 'dashboard_uuid'
            | 'slug'
        >
    >
>;

export type DbSavedChart = {
    saved_query_id: number;
    saved_query_uuid: string;
    space_id: number | null;
    dashboard_uuid: string | null;
    name: string;
    created_at: Date;
    description: string | undefined;
    last_version_chart_kind: ChartKind;
    last_version_updated_at: Date;
    last_version_updated_by_user_uuid: string | undefined;
    search_vector: string;
    slug: string;
};

export type DbSavedChartVersion = {
    saved_queries_version_id: number;
    saved_queries_version_uuid: string;
    created_at: Date;
    explore_name: string;
    filters: any;
    row_limit: number;
    chart_type: ChartType;
    saved_query_id: number;
    chart_config: ChartConfig['config'] | undefined;
    pivot_dimensions: string[] | undefined;
    updated_by_user_uuid: string | undefined;
    timezone: string | undefined;
};

export type SavedChartVersionsTable = Knex.CompositeTableType<
    DbSavedChartVersion,
    CreateDbSavedChartVersion
>;

export type CreateDbSavedChartVersion = Pick<
    DbSavedChartVersion,
    | 'saved_query_id'
    | 'explore_name'
    | 'filters'
    | 'row_limit'
    | 'chart_type'
    | 'pivot_dimensions'
    | 'chart_config'
    | 'updated_by_user_uuid'
    | 'timezone'
>;

type DbSavedChartVersionField = {
    saved_queries_version_field_id: number;
    saved_queries_version_id: number;
    name: string;
    field_type: DBFieldTypes;
    order: number;
};

export type CreateDbSavedChartVersionField = Pick<
    DbSavedChartVersionField,
    'saved_queries_version_id' | 'name' | 'field_type' | 'order'
>;

export const SavedChartVersionFieldsTableName = 'saved_queries_version_fields';
export type SavedChartVersionFieldsTable = Knex.CompositeTableType<
    DbSavedChartVersionField,
    CreateDbSavedChartVersionField
>;

type DbSavedChartVersionSort = {
    saved_queries_version_sort_id: number;
    saved_queries_version_id: number;
    field_name: string;
    descending: boolean;
    order: number;
};

export type CreateDbSavedChartVersionSort = Pick<
    DbSavedChartVersionSort,
    'saved_queries_version_id' | 'field_name' | 'descending' | 'order'
>;

export const SavedChartVersionSortsTableName = 'saved_queries_version_sorts';
export type SavedChartVersionSortsTable = Knex.CompositeTableType<
    DbSavedChartVersionSort,
    CreateDbSavedChartVersionSort
>;

export const SavedChartTableCalculationTableName =
    'saved_queries_version_table_calculations';
export type DbSavedChartTableCalculation = {
    saved_queries_version_table_calculations_id: number;
    name: string;
    display_name: string;
    order: number;
    calculation_raw_sql: string;
    saved_queries_version_id: number;
    format?: CustomFormat;
};

export type DbSavedChartTableCalculationInsert = Omit<
    DbSavedChartTableCalculation,
    'saved_queries_version_table_calculations_id'
>;
export type SavedChartTableCalculationTable = Knex.CompositeTableType<
    DbSavedChartTableCalculation,
    DbSavedChartTableCalculationInsert
>;
export const SavedChartCustomDimensionsTableName =
    'saved_queries_version_custom_dimensions';

export type DbSavedChartCustomDimension = {
    saved_queries_version_custom_dimension_id: number;
    saved_queries_version_id: number;
    id: string;
    name: string;
    dimension_id: string;
    table: string;
    bin_type: string;
    bin_number: number | null;
    bin_width: number | null;
    custom_range: BinRange[] | null; // JSONB
    order: number;
};
export type DbSavedChartCustomDimensionInsert = Omit<
    DbSavedChartCustomDimension,
    'saved_queries_version_custom_dimension_id' | 'custom_range'
> & {
    custom_range: string | null;
};

export const SavedChartAdditionalMetricTableName =
    'saved_queries_version_additional_metrics';
export type DbSavedChartAdditionalMetric = {
    saved_queries_version_additional_metric_id: number;
    table: string;
    name: string;
    label?: string;
    type: MetricType;
    description?: string;
    sql: string;
    hidden?: boolean;
    round?: number;
    compact?: CompactOrAlias;
    format?: string;
    percentile?: number;
    saved_queries_version_id: number;
    filters: MetricFilterRule[] | null; // JSONB
    base_dimension_name: string | null;
    uuid: string;
    format_options?: CustomFormat | null; // JSONB
};
export type DbSavedChartAdditionalMetricInsert = Omit<
    DbSavedChartAdditionalMetric,
    | 'saved_queries_version_additional_metric_id'
    | 'filters'
    | 'uuid'
    | 'format_options'
> & {
    filters: string | null;
    format_options: string | null;
};

export type SavedChartAdditionalMetricTable = Knex.CompositeTableType<
    DbSavedChartAdditionalMetric,
    DbSavedChartAdditionalMetricInsert
>;

export type DBFilteredAdditionalMetrics = Pick<
    DbSavedChartAdditionalMetric,
    | 'saved_queries_version_additional_metric_id'
    | 'table'
    | 'name'
    | 'type'
    | 'sql'
    | 'uuid'
> &
    Partial<
        Pick<
            DbSavedChartAdditionalMetric,
            | 'label'
            | 'description'
            | 'hidden'
            | 'round'
            | 'compact'
            | 'format'
            | 'percentile'
            | 'filters'
            | 'base_dimension_name'
            | 'format_options'
        >
    >;
