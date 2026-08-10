import {
    getAggregatedField,
    type VizAggregationOptions,
    type WarehouseSqlBuilder,
} from '@lightdash/common';

export type WidenValueColumn = {
    /** Column in the base SQL holding the metric. */
    reference: string;
    /** How to collapse the metric within one index-column group. */
    aggregation: VizAggregationOptions;
};

/**
 * Widens a query in SQL: one column per value of a dimension, one row per index
 * column.
 *
 * Both pivot placements in a merge are this same operation — "pre" and "post"
 * describe only where it sits relative to the join:
 *
 * - **Pre-pivot** widens one source before the join. It is grain repair: a
 *   dimension only one source has cannot survive the join as rows without
 *   fanning the others out, but it can survive as columns.
 * - **Post-pivot** widens the merged result. It is presentation, and it is only
 *   correct when the dimension is part of the join key, because only then is
 *   every source already at that grain.
 *
 * `PivotQueryBuilder` cannot do either job — it emits a *long* result annotated
 * with row_index/column_index and widens above the query, so its output still
 * carries one row per pivot value. Widening has to happen in SQL for the join
 * to be one-to-one, which means conditional aggregation and a value set known
 * at compile time.
 *
 * The `aggregation` never re-aggregates in the post-pivot case: the merged
 * result is unique on the join key, so each conditional sees at most one row
 * and every aggregation choice returns the same value.
 */
export class WideningQueryBuilder {
    private readonly sql: string;

    private readonly indexColumns: string[];

    private readonly pivotColumn: string;

    private readonly pivotValues: string[];

    /** Emit a column for rows whose pivot dimension is null. */
    private readonly includeNulls: boolean;

    private readonly valueColumns: WidenValueColumn[];

    private readonly warehouseSqlBuilder: WarehouseSqlBuilder;

    constructor({
        sql,
        indexColumns,
        pivotColumn,
        pivotValues,
        valueColumns,
        warehouseSqlBuilder,
        includeNulls = false,
    }: {
        sql: string;
        indexColumns: string[];
        pivotColumn: string;
        pivotValues: string[];
        valueColumns: WidenValueColumn[];
        warehouseSqlBuilder: WarehouseSqlBuilder;
        includeNulls?: boolean;
    }) {
        this.sql = sql;
        this.indexColumns = indexColumns;
        this.pivotColumn = pivotColumn;
        this.pivotValues = pivotValues;
        this.valueColumns = valueColumns;
        this.warehouseSqlBuilder = warehouseSqlBuilder;
        this.includeNulls = includeNulls;
    }

    private quote(identifier: string): string {
        const quoteChar = this.warehouseSqlBuilder.getFieldQuoteChar();
        return `${quoteChar}${identifier}${quoteChar}`;
    }

    private stringLiteral(value: string): string {
        const quoteChar = this.warehouseSqlBuilder.getStringQuoteChar();
        return `${quoteChar}${this.warehouseSqlBuilder.escapeString(
            value,
        )}${quoteChar}`;
    }

    /**
     * Output name for one metric/value pair. The value's position is part of
     * the name so that two values differing only in punctuation ("no-show" and
     * "no show") cannot collapse onto the same column.
     */
    private columnName(reference: string, valueIndex: number): string {
        const value = this.pivotValues[valueIndex];
        const slug =
            value === undefined
                ? 'null'
                : value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '_')
                      .replace(/^_+|_+$/g, '');
        return `${reference}_${valueIndex}_${slug}`;
    }

    /** Output column for each (metric, pivot value) pair. */
    getColumns(): {
        indexColumns: string[];
        valueColumns: Array<{
            reference: string;
            pivotValue: string | null;
            column: string;
        }>;
    } {
        return {
            indexColumns: [...this.indexColumns],
            valueColumns: this.valueColumns.flatMap(({ reference }) => [
                ...this.pivotValues.map((pivotValue, valueIndex) => ({
                    reference,
                    pivotValue,
                    column: this.columnName(reference, valueIndex),
                })),
                ...(this.includeNulls
                    ? [
                          {
                              reference,
                              pivotValue: null,
                              column: this.columnName(
                                  reference,
                                  this.pivotValues.length,
                              ),
                          },
                      ]
                    : []),
            ]),
        };
    }

    private aggregate(
        { reference, aggregation }: WidenValueColumn,
        condition: string,
        valueIndex: number,
    ): string {
        // getAggregatedField quotes the reference itself and wraps it in the
        // adapter's aggregation (which is not always `AGG(x)` — Postgres emits
        // `(ARRAY_AGG(x))[1]` for ANY), so the CASE is substituted into the
        // expression it returns rather than rebuilt here.
        const aggregated = getAggregatedField(
            this.warehouseSqlBuilder,
            aggregation,
            reference,
        );
        const quotedReference = this.quote(reference);
        if (!aggregated.includes(quotedReference)) {
            throw new Error(
                `Cannot pre-pivot "${reference}": the ${aggregation} aggregation compiled to "${aggregated}", which does not contain the quoted column.`,
            );
        }
        const conditional = `CASE WHEN ${condition} THEN ${quotedReference} END`;
        return `${aggregated.replace(
            quotedReference,
            conditional,
        )} AS ${this.quote(this.columnName(reference, valueIndex))}`;
    }

    toSql(): string {
        const conditions = [
            ...this.pivotValues.map(
                (value) =>
                    `${this.quote(this.pivotColumn)} = ${this.stringLiteral(
                        value,
                    )}`,
            ),
            ...(this.includeNulls
                ? [`${this.quote(this.pivotColumn)} IS NULL`]
                : []),
        ];

        const selects = [
            ...this.indexColumns.map((column) => this.quote(column)),
            ...this.valueColumns.flatMap((valueColumn) =>
                conditions.map((condition, valueIndex) =>
                    this.aggregate(valueColumn, condition, valueIndex),
                ),
            ),
        ];

        const groupBy = this.indexColumns.map((column) => this.quote(column));

        return [
            `SELECT ${selects.join(',\n       ')}`,
            `FROM (\n${this.sql}\n) AS widen_source`,
            `GROUP BY ${groupBy.join(', ')}`,
        ].join('\n');
    }
}
