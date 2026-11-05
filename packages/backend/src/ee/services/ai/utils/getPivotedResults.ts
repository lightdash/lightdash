import { DuckDBInstance } from '@duckdb/node-api';
import {
    formatFieldLabel,
    type ItemsMap,
    type PivotedResults,
    type SortField,
} from '@lightdash/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const getNullsFirstLast = (sort: SortField) => {
    if (sort.nullsFirst === undefined) return '';
    return sort.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
};

const quoteId = (id: string) => `"${id.replace(/"/g, '""')}"`;

export const getPivotedResults = async (
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
    pivotFields: string[],
    metrics: string[],
    secondaryMetrics: string[],
    sorts: SortField[],
): Promise<PivotedResults> => {
    const fields = Object.keys(fieldsMap);
    const allMetrics = [...metrics, ...secondaryMetrics];
    const isMultiMetric = allMetrics.length > 1;
    // Pivoted columns are named `<pivot value>`, or `<pivot value>_<metric index>` with several metrics
    const getSuffix = (index: number) => (isMultiMetric ? `_${index}` : '');
    const usingFields = allMetrics.map((metric, index) =>
        isMultiMetric
            ? `FIRST(${quoteId(metric)}) AS "${index}"`
            : `FIRST(${quoteId(metric)})`,
    );

    // Get the grouping columns (all non-pivot, non-metric fields)
    const groupByFields = fields.filter(
        (field) => !pivotFields.includes(field) && !allMetrics.includes(field),
    );

    // After pivoting, we can only sort by:
    // 1. Columns in the GROUP BY clause (groupByFields)
    // 2. The new pivoted columns (which we don't know yet)
    // We CANNOT sort by the original metric columns (they no longer exist after USING aggregation)
    const validSorts = sorts.filter((sort) =>
        groupByFields.includes(sort.fieldId),
    );

    // Unsorted groups keep the input order: PIVOT output order is undefined
    const orderByPart = `ORDER BY ${[
        ...validSorts.map(
            (sort) =>
                `${quoteId(sort.fieldId)} ${
                    sort.descending ? 'DESC' : 'ASC'
                }${getNullsFirstLast(sort)}`,
        ),
        '__order__',
    ].join(', ')}`;

    // __order__ is constant per group, so grouping by it never splits a group
    const groupByPart = `GROUP BY ${[
        ...groupByFields.map(quoteId),
        '__order__',
    ].join(', ')}`;
    const partitionPart = groupByFields.length
        ? `PARTITION BY ${groupByFields.map(quoteId).join(', ')}`
        : '';
    const orderedSource = `SELECT * EXCLUDE (__row__), MIN(__row__) OVER (${partitionPart}) AS __order__
        FROM (SELECT *, ROW_NUMBER() OVER () AS __row__ FROM results_data)`;

    // For multiple pivot fields, create a composite key
    let pivotOn: string;
    let pivotSource: string;
    if (pivotFields.length === 1) {
        pivotOn = quoteId(pivotFields[0]);
        pivotSource = orderedSource;
    } else {
        // Create composite key by concatenating pivot fields with ' - ' separator
        const compositeKey = pivotFields
            .map(
                (field) =>
                    `COALESCE(CAST(${quoteId(field)} AS VARCHAR), 'NULL')`,
            )
            .join(" || ' - ' || ");
        pivotOn = '__pivot_key__';
        pivotSource = `SELECT *, ${compositeKey} as __pivot_key__ FROM (${orderedSource})`;
    }
    const query = `SELECT * EXCLUDE (__order__) FROM (
    PIVOT (${pivotSource})
    ON ${pivotOn}
    USING ${usingFields.join(', ')}
    ${groupByPart}
    ) ${orderByPart}`;

    const instance = await DuckDBInstance.create(':memory:');
    try {
        const connection = await instance.connect();
        try {
            await connection.run('SET allow_community_extensions = false');
            await connection.run('SET autoinstall_known_extensions = false');
            await connection.run('SET autoload_known_extensions = false');

            const tmpFile = path.join(
                os.tmpdir(),
                `lightdash_pivot_${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2)}.json`,
            );
            try {
                await fs.writeFile(tmpFile, JSON.stringify(rows));
                await connection.run(
                    `CREATE TABLE results_data AS SELECT * FROM read_json_auto('${tmpFile}')`,
                );
            } finally {
                await fs.unlink(tmpFile).catch(() => {});
            }

            await connection.run('SET enable_external_access = false');

            const result = await connection.run(query);
            // getRowObjectsJS keeps the JS value mapping the legacy duckdb client
            // produced: Date for DATE/TIMESTAMP, bigint for BIGINT, number for DOUBLE.
            const pivoted = await result.getRowObjectsJS();
            const pivotedColumns = Object.keys(pivoted[0]).filter(
                (field) => !groupByFields.includes(field),
            );
            const getColumns = (metricIndexes: number[]) =>
                metricIndexes.flatMap((index) =>
                    pivotedColumns
                        .filter((column) => column.endsWith(getSuffix(index)))
                        .map((column) => ({
                            column,
                            pivotValue: column.slice(
                                0,
                                column.length - getSuffix(index).length,
                            ),
                            metric: allMetrics[index],
                        })),
                );
            const columns = getColumns(metrics.map((_, index) => index));
            const secondaryColumns = getColumns(
                secondaryMetrics.map((_, index) => metrics.length + index),
            );
            return {
                results: pivoted,
                metrics: columns.map(({ column }) => column),
                secondaryMetrics: secondaryColumns.map(({ column }) => column),
                // Mirrors the app: pivot value, prefixed with the metric when several are plotted
                labels: Object.fromEntries(
                    [...columns, ...secondaryColumns].map(
                        ({ column, pivotValue, metric }) => [
                            column,
                            isMultiMetric
                                ? `[${pivotValue}] ${formatFieldLabel(
                                      metric,
                                      fieldsMap,
                                  )}`
                                : pivotValue,
                        ],
                    ),
                ),
            };
        } finally {
            // Never let a close failure replace the in-flight error
            try {
                connection.closeSync();
            } catch {
                // best-effort cleanup
            }
        }
    } finally {
        try {
            instance.closeSync();
        } catch {
            // best-effort cleanup
        }
    }
};
