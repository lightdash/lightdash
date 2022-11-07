import {
    ChartConfig,
    DBFieldTypes,
    NumberStyleOrAlias,
} from '@lightdash/common';
import { Knex } from 'knex';

export const SavedChartsTableName = 'saved_queries';
export const SavedChartVersionsTableName = 'saved_queries_versions';

type DbSavedChart = {
    saved_query_id: number;
    saved_query_uuid: string;
    space_id: number;
    name: string;
    created_at: Date;
    description: string | undefined;
};

export type SavedChartTable = Knex.CompositeTableType<
    DbSavedChart,
    Pick<DbSavedChart, 'name' | 'space_id' | 'description'>,
    Pick<DbSavedChart, 'name' | 'description'>
>;

export type DbSavedChartVersion = {
    saved_queries_version_id: number;
    saved_queries_version_uuid: string;
    created_at: Date;
    explore_name: string;
    filters: any;
    row_limit: number;
    chart_type: 'big_number' | 'table' | 'cartesian';
    saved_query_id: number;
    chart_config: ChartConfig['config'] | undefined;
    pivot_dimensions: string[] | undefined;
    updated_by_user_uuid: string | undefined;
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
};

export type DbSavedChartTableCalculationInsert = Omit<
    DbSavedChartTableCalculation,
    'saved_queries_version_table_calculations_id'
>;
export type SavedChartTableCalculationTable = Knex.CompositeTableType<
    DbSavedChartTableCalculation,
    DbSavedChartTableCalculationInsert
>;

export const SavedChartAdditionalMetricTableName =
    'saved_queries_version_additional_metrics';
export type DbSavedChartAdditionalMetric = {
    saved_queries_version_additional_metric_id: number;
    table: string;
    name: string;
    label?: string;
    type: string;
    description?: string;
    sql?: string;
    hidden?: boolean;
    round?: number;
    compact?: NumberStyleOrAlias;
    format?: string;
    saved_queries_version_id: number;
};
export type DbSavedChartAdditionalMetricInsert = Omit<
    DbSavedChartAdditionalMetric,
    'saved_queries_version_additional_metric_id'
>;
