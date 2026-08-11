import {
    assertUnreachable,
    MERGE_TRUNCATED_COLUMN,
    mergeCalculationReferencePattern,
    MergeJoinType,
    VizAggregationOptions,
    type MergeQueryColumns,
    type MergeTableCalculation,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { applyLimitToSqlQuery } from './utils';
import { WideningQueryBuilder } from './WideningQueryBuilder';

/**
 * Spread one join key part across columns after the join.
 *
 * Restricted to a join key part by construction: post-pivoting a dimension only
 * one source has would mean widening a result the merge has already fanned out.
 */
export type MergePostPivot = {
    /** Name of the join key part to spread into columns. */
    keyName: string;
    /** Values to emit a column for. Must be known at compile time. */
    values: string[];
    /** Emit a column for rows whose key part is null. */
    includeNulls: boolean;
};

/** One sort term over the merged result, naming a merged column. */
export type MergeSort = {
    /** Column in the merged result, as `getColumns()` reports it. */
    column: string;
    descending: boolean;
};

/**
 * One already-compiled side of a merge. The SQL is whatever that query
 * compiles to on its own — including its pre-pivot wrap, if it has one — so
 * this builder never needs to know how a source was produced.
 */
export type MergeQuerySourceSql = {
    /** Caller-facing id. Names this source's CTE in the merged statement. */
    id: string;
    sql: string;
    /** Column in `sql` holding each join key part, keyed by the part's name. */
    joinKeyColumnByName: Record<string, string>;
    /** Columns in `sql` this source contributes to the merged result. */
    valueColumns: string[];
};

/**
 * Compiles several aggregated queries into a single warehouse statement: one
 * CTE per source, joined on a shared key.
 *
 * It assumes every source is already unique on the join key. That is the
 * caller's job (`validateMergeQuery` in common), because a source that still
 * carries an unaccounted dimension fans the other sources out — the merged
 * table looks reasonable and every aggregate over it is wrong.
 */
export class MergeQueryBuilder {
    private readonly sources: MergeQuerySourceSql[];

    private readonly joinKeyNames: string[];

    private readonly joinType: MergeJoinType;

    private readonly warehouseSqlBuilder: WarehouseSqlBuilder;

    private readonly limit: number | undefined;

    /** CTE identifier per source, positionally aligned with `sources`. */
    private readonly cteNames: string[];

    private readonly postPivot: MergePostPivot | undefined;

    private readonly nullPlaceholderByKeyName: Record<string, string>;

    private readonly tableCalculations: MergeTableCalculation[];

    private readonly sourceRowCap: number | undefined;

    private readonly sorts: MergeSort[];

    constructor({
        sources,
        joinKeyNames,
        joinType,
        warehouseSqlBuilder,
        limit,
        postPivot,
        tableCalculations,
        nullPlaceholderByKeyName,
        sourceRowCap,
        sorts,
    }: {
        sources: MergeQuerySourceSql[];
        joinKeyNames: string[];
        joinType: MergeJoinType;
        warehouseSqlBuilder: WarehouseSqlBuilder;
        limit?: number;
        postPivot?: MergePostPivot;
        /** Calculations over the merged result, applied after any post-pivot. */
        tableCalculations?: MergeTableCalculation[];
        /**
         * Most rows a single query may contribute. Reaching it is reported
         * rather than silently trimmed — a join over a trimmed side returns
         * numbers that look complete and are not.
         */
        sourceRowCap?: number;
        /** Sort the merged result. Defaults to the join key when omitted. */
        sorts?: MergeSort[];
        /**
         * Placeholder SQL literal per join key name. Supplying one makes null
         * keys match each other; omitting it leaves them unmatched.
         */
        nullPlaceholderByKeyName?: Record<string, string>;
    }) {
        if (postPivot && !joinKeyNames.includes(postPivot.keyName)) {
            throw new Error(
                `Cannot pivot the merged result by "${postPivot.keyName}" because it is not part of the join key.`,
            );
        }
        this.sources = sources;
        this.joinKeyNames = joinKeyNames;
        this.joinType = joinType;
        this.warehouseSqlBuilder = warehouseSqlBuilder;
        this.limit = limit;
        this.postPivot = postPivot;
        this.nullPlaceholderByKeyName = nullPlaceholderByKeyName ?? {};
        this.tableCalculations = tableCalculations ?? [];
        this.sourceRowCap = sourceRowCap;
        this.sorts = sorts ?? [];
        // Index-prefixed so two source ids that differ only in punctuation
        // cannot collapse to the same identifier.
        this.cteNames = sources.map(
            (source, index) =>
                `merge_${index}_${source.id
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '')}`,
        );
    }

    private quote(identifier: string): string {
        const quoteChar = this.warehouseSqlBuilder.getFieldQuoteChar();
        return `${quoteChar}${identifier}${quoteChar}`;
    }

    private sourceColumn(sourceIndex: number, column: string): string {
        return `${this.cteNames[sourceIndex]}.${this.quote(column)}`;
    }

    /**
     * Merged name for a source's value column. Positional rather than derived
     * from the field, so a long field id cannot push the alias past a
     * warehouse identifier limit — Postgres truncates at 63 characters, which
     * would collapse two columns into one silently. Identity lives in the
     * items map the caller builds, not in the alias.
     */
    private mergedValueColumnName(sourceIndex: number, column: string): string {
        const columnIndex =
            this.sources[sourceIndex].valueColumns.indexOf(column);
        if (columnIndex === -1) {
            throw new Error(
                `Merge source "${this.sources[sourceIndex].id}" does not select column "${column}".`,
            );
        }
        return `c${sourceIndex}_${columnIndex}`;
    }

    private joinKeyColumnFor(sourceIndex: number, keyName: string): string {
        const column = this.sources[sourceIndex].joinKeyColumnByName[keyName];
        if (column === undefined) {
            throw new Error(
                `Merge source "${this.sources[sourceIndex].id}" has no column for join key "${keyName}".`,
            );
        }
        return this.sourceColumn(sourceIndex, column);
    }

    getColumns(): MergeQueryColumns {
        const mergedNames = this.sources.map((source, index) =>
            Object.fromEntries(
                source.valueColumns.map((column) => [
                    column,
                    this.mergedValueColumnName(index, column),
                ]),
            ),
        );

        if (!this.postPivot) {
            return {
                joinKeyColumns: [...this.joinKeyNames],
                valueColumnBySourceColumn: Object.fromEntries(
                    this.sources.map((source, index) => [
                        source.id,
                        mergedNames[index],
                    ]),
                ),
            };
        }

        // Post-pivot replaces each merged value column with one column per
        // value of the pivoted key part, so the mapping is per (column, value).
        const widened = this.getWideningBuilder('').getColumns();
        const widenedByReference = widened.valueColumns.reduce<
            Record<string, Record<string, string>>
        >((acc, { reference, pivotValue, column }) => {
            acc[reference] = acc[reference] ?? {};
            acc[reference][pivotValue ?? ''] = column;
            return acc;
        }, {});

        return {
            joinKeyColumns: widened.indexColumns,
            valueColumnBySourceColumn: Object.fromEntries(
                this.sources.map((source, index) => [
                    source.id,
                    Object.fromEntries(
                        source.valueColumns.flatMap((column) =>
                            Object.entries(
                                widenedByReference[
                                    mergedNames[index][column]
                                ] ?? {},
                            ).map(([pivotValue, widenedColumn]) => [
                                `${column}${
                                    pivotValue === '' ? '' : `.${pivotValue}`
                                }`,
                                widenedColumn,
                            ]),
                        ),
                    ),
                ]),
            ),
        };
    }

    /**
     * How the merged result names each join key column. FULL keeps rows no
     * source has in common, so the key has to be coalesced across every source;
     * LEFT and INNER can only produce keys the first source already has.
     */
    private getJoinKeySelect(keyName: string): string {
        const alias = this.quote(keyName);

        switch (this.joinType) {
            case MergeJoinType.FULL: {
                if (this.sources.length === 1) {
                    return `${this.joinKeyColumnFor(0, keyName)} AS ${alias}`;
                }
                const columns = this.sources.map((_, index) =>
                    this.joinKeyColumnFor(index, keyName),
                );
                return `COALESCE(${columns.join(', ')}) AS ${alias}`;
            }
            case MergeJoinType.LEFT:
            case MergeJoinType.INNER:
                return `${this.joinKeyColumnFor(0, keyName)} AS ${alias}`;
            default:
                return assertUnreachable(
                    this.joinType,
                    `Unknown merge join type ${this.joinType}`,
                );
        }
    }

    private getJoinKeyword(): string {
        switch (this.joinType) {
            case MergeJoinType.FULL:
                return 'FULL OUTER JOIN';
            case MergeJoinType.LEFT:
                return 'LEFT JOIN';
            case MergeJoinType.INNER:
                return 'INNER JOIN';
            default:
                return assertUnreachable(
                    this.joinType,
                    `Unknown merge join type ${this.joinType}`,
                );
        }
    }

    /**
     * Join condition for source `sourceIndex` against everything already
     * joined. Under a FULL join an earlier source's key can be null on rows it
     * did not contribute, so the comparison is against the coalesce of all
     * preceding sources rather than against the first one.
     *
     * Plain equality, deliberately, rather than the warehouse's null-safe
     * helper the pivot and period-over-period joins use: Postgres rejects a
     * FULL OUTER JOIN whose condition is not merge- or hash-joinable, which
     * both `(a = b OR (a IS NULL AND b IS NULL))` and `IS NOT DISTINCT FROM`
     * are. Using it only for LEFT and INNER would silently change what a null
     * key means when the user toggles the include mode. The cost is that null
     * keys never match: under a FULL join each source contributes its own
     * null-key row instead of one merged row.
     */
    private getJoinCondition(sourceIndex: number): string {
        return this.joinKeyNames
            .map((keyName) => {
                const previous = this.sources
                    .slice(0, sourceIndex)
                    .map((_, index) => this.joinKeyColumnFor(index, keyName));
                const left =
                    this.joinType === MergeJoinType.FULL && previous.length > 1
                        ? `COALESCE(${previous.join(', ')})`
                        : previous[0];
                const right = this.joinKeyColumnFor(sourceIndex, keyName);
                const placeholder = this.nullPlaceholderByKeyName[keyName];
                if (placeholder === undefined) {
                    return `${left} = ${right}`;
                }
                // Two plain equalities, so the condition stays hash-joinable
                // and Postgres accepts it under a FULL JOIN. The null-ness
                // term is what makes the placeholder safe: a real value that
                // happens to equal it can never pair with a null, because
                // their null-ness differs.
                return `(${left} IS NULL) = (${right} IS NULL) AND COALESCE(${left}, ${placeholder}) = COALESCE(${right}, ${placeholder})`;
            })
            .join(' AND ');
    }

    toSql(): string {
        // One row past the cap, so hitting it is detectable rather than
        // indistinguishable from a query that happens to end there.
        const capped = (sql: string) =>
            this.sourceRowCap === undefined
                ? sql
                : `SELECT * FROM (\n${sql}\n) AS capped LIMIT ${
                      this.sourceRowCap + 1
                  }`;

        const cteList = this.sources.map(
            (source, index) =>
                `${this.cteNames[index]} AS (\n${capped(source.sql)}\n)`,
        );

        // Counting a CTE that is already capped costs at most cap+1 rows.
        if (this.sourceRowCap !== undefined) {
            const checks = this.cteNames
                .map(
                    (cteName) =>
                        `(SELECT COUNT(*) FROM ${cteName}) > ${this.sourceRowCap}`,
                )
                .join(' OR ');
            cteList.push(
                `merge_guard AS (SELECT (${checks}) AS ${this.quote(
                    MERGE_TRUNCATED_COLUMN,
                )})`,
            );
        }

        const ctes = cteList.join(',\n');

        const selects = [
            ...this.joinKeyNames.map((keyName) =>
                this.getJoinKeySelect(keyName),
            ),
            ...this.sources.flatMap((source, index) =>
                source.valueColumns.map(
                    (column) =>
                        `${this.sourceColumn(index, column)} AS ${this.quote(
                            this.mergedValueColumnName(index, column),
                        )}`,
                ),
            ),
            ...(this.sourceRowCap !== undefined
                ? [`merge_guard.${this.quote(MERGE_TRUNCATED_COLUMN)}`]
                : []),
        ];

        const guardJoin =
            this.sourceRowCap === undefined ? [] : ['CROSS JOIN merge_guard'];

        const joins = this.sources
            .slice(1)
            .map(
                (_, offset) =>
                    `${this.getJoinKeyword()} ${
                        this.cteNames[offset + 1]
                    } ON ${this.getJoinCondition(offset + 1)}`,
            );

        const sql = [
            `WITH ${ctes}`,
            `SELECT ${selects.join(',\n       ')}`,
            `FROM ${this.cteNames[0]}`,
            ...joins,
            ...guardJoin,
        ].join('\n');

        const merged = this.postPivot
            ? this.getWideningBuilder(sql).toSql()
            : sql;

        // Ordered outside the calculation wrapper, so a sort can name a
        // calculated column and so the ordering is not left inside a subquery,
        // where a warehouse is free to discard it.
        const orderBy = this.getOrderBy();

        return applyLimitToSqlQuery({
            sqlQuery: [
                this.withTableCalculations(merged),
                ...(orderBy.length > 0
                    ? [`ORDER BY ${orderBy.join(', ')}`]
                    : []),
            ].join('\n'),
            limit: this.limit,
        });
    }

    /**
     * Sort terms for the merged result, in alias space.
     *
     * Defaults to the join key, which is the only ordering a merge has before
     * anyone asks for one. A pivoted key part has become columns by this point
     * and can no longer be ordered on.
     */
    private getOrderBy(): string[] {
        if (this.sorts.length > 0) {
            return this.sorts.map(({ column, descending }) => {
                if (!this.orderableColumns().has(column)) {
                    throw new Error(
                        `Cannot sort the merged result by "${column}", which it has no column for.`,
                    );
                }
                return `${this.quote(column)}${descending ? ' DESC' : ''}`;
            });
        }
        return this.joinKeyNames
            .filter((keyName) => keyName !== this.postPivot?.keyName)
            .map((keyName) => this.quote(keyName));
    }

    /** Every column the merged statement exposes to an ORDER BY. */
    private orderableColumns(): Set<string> {
        const columns = this.getColumns();
        return new Set([
            ...columns.joinKeyColumns,
            ...Object.values(columns.valueColumnBySourceColumn).flatMap(
                (bySourceColumn) => Object.values(bySourceColumn),
            ),
            ...this.tableCalculations.map((calculation) => calculation.name),
        ]);
    }

    /**
     * Wraps the merged statement so calculations see the merged row — the only
     * place a row-wise calculation across two queries is meaningful. Applied
     * outside any post-pivot, so a calculation can reference pivoted columns.
     */
    private withTableCalculations(mergedSql: string): string {
        if (this.tableCalculations.length === 0) {
            return mergedSql;
        }

        const columns = this.getColumns();
        const columnByReference: Record<string, string> = {
            ...Object.fromEntries(
                columns.joinKeyColumns.map((column) => [column, column]),
            ),
            ...Object.fromEntries(
                Object.entries(columns.valueColumnBySourceColumn).flatMap(
                    ([sourceId, bySourceColumn]) =>
                        Object.entries(bySourceColumn).map(
                            ([sourceColumn, mergedColumn]) => [
                                `${sourceId}.${sourceColumn}`,
                                mergedColumn,
                            ],
                        ),
                ),
            ),
        };

        const selects = this.tableCalculations.map((calculation) => {
            const compiled = calculation.sql.replace(
                mergeCalculationReferencePattern,
                (whole, reference: string) => {
                    const column = columnByReference[reference];
                    if (column === undefined) {
                        throw new Error(
                            `Calculation "${calculation.name}" references ${reference}, which the merged result has no column for.`,
                        );
                    }
                    return `merged_result.${this.quote(column)}`;
                },
            );
            return `${compiled} AS ${this.quote(calculation.name)}`;
        });

        return [
            `SELECT merged_result.*,\n       ${selects.join(',\n       ')}`,
            `FROM (\n${mergedSql}\n) AS merged_result`,
        ].join('\n');
    }

    /**
     * Widens the merged result over one join key part.
     *
     * The merge is unique on the full join key, so each conditional matches at
     * most one row per group and nothing is really rolled up. That makes the
     * post-pivot safe over metrics that do not sum — count distinct, averages,
     * ratios — but the aggregate must still be **null-skipping**: every group
     * has one non-null row and N-1 nulls. MAX skips them. ANY does not, because
     * Postgres compiles it to `(ARRAY_AGG(x))[1]`, which keeps nulls in the
     * array and returns one whenever the matching row is not sorted first.
     */
    private getWideningBuilder(mergedSql: string): WideningQueryBuilder {
        const postPivot = this.postPivot!;
        return new WideningQueryBuilder({
            sql: mergedSql,
            indexColumns: this.joinKeyNames.filter(
                (keyName) => keyName !== postPivot.keyName,
            ),
            pivotColumn: postPivot.keyName,
            pivotValues: postPivot.values,
            includeNulls: postPivot.includeNulls,
            valueColumns: this.sources.flatMap((source, index) =>
                source.valueColumns.map((column) => ({
                    reference: this.mergedValueColumnName(index, column),
                    aggregation: VizAggregationOptions.MAX,
                })),
            ),
            warehouseSqlBuilder: this.warehouseSqlBuilder,
        });
    }
}
