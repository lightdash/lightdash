import { type ItemsMap } from '../../../../types/field';
import { type SortField } from '../../../../types/metricQuery';

export type PivotedResults = {
    results: Record<string, unknown>[];
    metrics: string[];
    /** Result keys of the secondary Y axis metric, one series each. */
    secondaryMetrics: string[];
    /** Series label per metric and secondary metric key. */
    labels: Record<string, string>;
};

export type GetPivotedResultsFn = (
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
    pivotFields: string[],
    metrics: string[],
    secondaryMetrics: string[],
    sorts: SortField[],
) => Promise<PivotedResults>;

export type QueryResults = {
    rows: Record<string, unknown>[];
    fields: ItemsMap;
};
