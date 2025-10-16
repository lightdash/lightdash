import { type ItemsMap } from '../../../../types/field';
import { type SortField } from '../../../../types/metricQuery';

export type PivotedResults = {
    results: Record<string, unknown>[];
    metrics: string[];
};

export type GetPivotedResultsFn = (
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    pivotFields: string[],
    metrics: string[],
    sorts: SortField[],
) => Promise<PivotedResults>;

export type QueryResults = {
    rows: Record<string, unknown>[];
    fields: ItemsMap;
};
