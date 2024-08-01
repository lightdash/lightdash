import {
    type DbtModelJoinType,
    type LineageGraph,
    type SupportedDbtAdapter,
} from './dbt';
import {
    type CompiledDimension,
    type CompiledMetric,
    type Dimension,
    type Metric,
    type Source,
} from './field';
import { type TableBase } from './table';

export type ExploreJoin = {
    table: string; // Must match a tableName in containing Explore
    sqlOn: string; // Built sql
    type?: DbtModelJoinType; // Optional join type
    alias?: string; // Optional alias for the joined tableName
    label?: string; // Optional UI label override for the underlying table
    hidden?: boolean;
    fields?: string[]; // Optional list of fields to include from the joined table
    always?: boolean; // Optional flag to always join the table
};

export type CompiledExploreJoin = Pick<
    ExploreJoin,
    'table' | 'sqlOn' | 'type' | 'hidden' | 'always'
> & {
    compiledSqlOn: string; // Sql on clause with template variables resolved
};

export type CompiledTable = TableBase & {
    dimensions: Record<string, CompiledDimension>;
    metrics: Record<string, CompiledMetric>;
    lineageGraph: LineageGraph;
    source?: Source | undefined;
    compiledSqlWhere?: string;
};

export type Explore = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    label: string; // Friendly name
    tags: string[];
    groupLabel?: string;
    baseTable: string; // Must match a tableName in tables
    joinedTables: CompiledExploreJoin[]; // Must match a tableName in tables
    tables: { [tableName: string]: CompiledTable }; // All tables in this explore
    targetDatabase: SupportedDbtAdapter; // Type of target database e.g. postgres/redshift/bigquery/snowflake/databricks
    warehouse?: string;
    ymlPath?: string;
    sqlPath?: string;
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
    Pick<Explore, 'name' | 'label' | 'groupLabel'> & {
        errors: InlineError[];
    };

export const isExploreError = (
    explore: Explore | ExploreError,
): explore is ExploreError => 'errors' in explore;

type SummaryExploreFields = 'name' | 'label' | 'tags' | 'groupLabel';
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
