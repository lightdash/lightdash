import { LineageGraph, SupportedDbtAdapter } from './dbt';
import {
    CompiledDimension,
    CompiledMetric,
    Dimension,
    Metric,
    Source,
} from './field';
import { TableBase } from './table';

export type ExploreJoin = {
    table: string; // Must match a tableName in containing Explore
    sqlOn: string; // Built sql
};

export type CompiledExploreJoin = ExploreJoin & {
    compiledSqlOn: string; // Sql on clause with template variables resolved
};

export type CompiledTable = TableBase & {
    dimensions: Record<string, CompiledDimension>;
    metrics: Record<string, CompiledMetric>;
    lineageGraph: LineageGraph;
    source?: Source | undefined;
};

export type Explore = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    label: string; // Friendly name
    tags: string[];
    baseTable: string; // Must match a tableName in tables
    joinedTables: CompiledExploreJoin[]; // Must match a tableName in tables
    tables: { [tableName: string]: CompiledTable }; // All tables in this explore
    targetDatabase: SupportedDbtAdapter; // Type of target database e.g. postgres/redshift/bigquery/snowflake/databricks
};

export enum InlineErrorType {
    METADATA_PARSE_ERROR = 'METADATA_PARSE_ERROR',
    NO_DIMENSIONS_FOUND = 'NO_DIMENSIONS_FOUND',
}

export type InlineError = {
    type: InlineErrorType;
    message: string;
};

export type ExploreError = Partial<Explore> &
    Pick<Explore, 'name' | 'label'> & {
        errors: InlineError[];
    };

export const isExploreError = (
    explore: Explore | ExploreError,
): explore is ExploreError => 'errors' in explore;

type SummaryExploreFields = 'name' | 'label' | 'tags';
type SummaryExploreErrorFields = SummaryExploreFields | 'errors';
type SummaryExtraFields = {
    description?: string;
    schemaName: string;
    databaseName: string;
};

export type SummaryExplore =
    | (Pick<Explore, SummaryExploreFields> & SummaryExtraFields)
    | (Pick<ExploreError, SummaryExploreErrorFields> &
          Partial<SummaryExtraFields>);

export type Table = TableBase & {
    dimensions: { [fieldName: string]: Dimension }; // Field names must be unique across dims and metrics
    metrics: { [fieldName: string]: Metric }; //
    lineageGraph: LineageGraph; // DAG structure representing the lineage of the table
    source?: Source;
};
