import {
    formatRows,
    type ParametersValuesMap,
    type PivotValuesColumn,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import { toItemsMap, type ChartFields } from './chartData';

export type ToResultRowsOptions = {
    /**
     * The display timezone the query ran with (the query API's
     * `resolvedTimezone`): timestamps format in it, dates stay calendar dates.
     */
    timezone?: string | null;
    /** The query's parameter values, for fields whose format reads them. */
    parameters?: ParametersValuesMap;
    /**
     * The value columns of a pivoted result (`pivotDetails.valuesColumns`):
     * a pivot column such as `orders_revenue_any_web` formats as its field.
     */
    pivotValuesColumns?: PivotValuesColumn[];
};

/**
 * Turns raw rows (one plain value per field id, as the query API's raw
 * results, the query SDK and CSV exports produce them) into the rows the
 * chart builders read: each value normalised and formatted exactly as the
 * query API formats it (`formatRows` in `@lightdash/common`).
 *
 * The visualization engine never runs a query: any source that can produce
 * rows keyed by field id, plus the fields' definitions, can feed it. The
 * fields' `format` matters: numbers are formatted from it, never taken from
 * a pre-formatted string. The fields are those of `ChartData`: Lightdash
 * items, or definitions with just a type, a label and a format.
 */
export const toResultRows = (
    rows: RawResultRow[],
    fields: ChartFields,
    { timezone, parameters, pivotValuesColumns }: ToResultRowsOptions = {},
): ResultRow[] =>
    formatRows(
        rows,
        toItemsMap(fields),
        pivotValuesColumns
            ? Object.fromEntries(
                  pivotValuesColumns.map((column) => [
                      column.pivotColumnName,
                      column,
                  ]),
              )
            : undefined,
        parameters,
        timezone ?? undefined,
    );
