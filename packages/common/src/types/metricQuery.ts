import { DbtColumnLightdashMetric } from './dbt';
import { CompiledMetric, FieldId } from './field';
import { Filters } from './filter';

export type TableCalculation = {
    index?: number;
    name: string;
    displayName: string;
    sql: string;
};
export type CompiledTableCalculation = TableCalculation & {
    compiledSql: string;
};

export interface AdditionalMetric extends DbtColumnLightdashMetric {
    table: string;
    name: string;
}

// Object used to query an explore. Queries only happen within a single explore
export type MetricQuery = {
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: Filters;
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
};
export type CompiledMetricQuery = MetricQuery & {
    compiledTableCalculations: CompiledTableCalculation[];
    compiledAdditionalMetrics: CompiledMetric[];
};
// Sort by
export type SortField = {
    fieldId: string; // Field must exist in the explore
    descending: boolean; // Direction of the sort
};

export const idPattern = /((.+)(?<!val)id$)/i;
export const extractEntityNameFromIdColumn = (
    columnName: string,
): string | null => {
    const match = idPattern.exec(columnName);
    if (match === null) {
        return match;
    }
    return (
        match[2]
            .toLowerCase()
            .split(/[^a-z]/)
            .filter((x) => x)
            .join('_') || null
    );
};
