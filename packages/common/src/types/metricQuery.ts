import { CompiledMetric, FieldId, friendlyName, MetricType } from './field';
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

export interface AdditionalMetric {
    label?: string;
    type: MetricType;
    description?: string;
    sql: string;
    hidden?: boolean;
    round?: number;
    format?: string;
    table: string;
    name: string;
}

export const isAdditionalMetric = (value: any): value is AdditionalMetric =>
    value?.table && value?.name && !value?.fieldType;

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

const idPattern = /(.+)id$/i;
export const extractEntityNameFromIdColumn = (
    columnName: string,
): string | null => {
    const match = columnName.match(idPattern);
    if (!match || columnName.toLowerCase().endsWith('valid')) {
        return null;
    }
    return (
        match[1]
            .toLowerCase()
            .split(/[^a-z]/)
            .filter((x) => x)
            .join('_') || null
    );
};

export const getAdditionalMetricLabel = (item: AdditionalMetric) =>
    `${friendlyName(item.table)} ${item.label}`;
