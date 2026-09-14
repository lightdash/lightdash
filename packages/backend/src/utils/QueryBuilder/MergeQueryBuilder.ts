import {
    assertUnreachable,
    DimensionType,
    mergeCalculationReferencePattern,
    MergeJoinType,
    type MergeFieldMeta,
    type MergeFieldTypes,
    type MergeJoinKeyPart,
    type MergeQueryColumns,
    type MergeTableCalculation,
    type MergeTerminalWrapper,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { applyLimitToSqlQuery } from './utils';

/**
 * A named CTE and its edges — the private, unpersisted IR the composable core
 * is assembled from. Node ids are source ids; CTE names derive from them
 * deterministically. Internal to this builder: engines meet at the execute
 * seam, never at this shape, and it is never persisted anywhere.
 */
type MergeIrNode = {
    id: string;
    sql: string;
    dependsOn: string[];
};

/**
 * Attaches the terminal stage — sort, limit — over a statement. The run path
 * owns when this happens, so anything that changes the row set (a pivot,
 * say) can stack on the core first.
 */
export const applyMergeTerminalWrapper = (
    sql: string,
    wrapper: Pick<MergeTerminalWrapper, 'orderBy' | 'limit'>,
): string =>
    applyLimitToSqlQuery({
        sqlQuery: [
            sql,
            ...(wrapper.orderBy.length > 0
                ? [`ORDER BY ${wrapper.orderBy.join(', ')}`]
                : []),
        ].join('\n'),
        limit: wrapper.limit ?? undefined,
    });

/**
 * Join-key SQL options for a merge: which keys are modeled as strings and
 * need a cast before coalescing, so a physically numeric column on one side
 * is comparable with a string on the other.
 */
export const getMergeJoinKeySqlOptions = (
    joinKey: MergeJoinKeyPart[],
    fieldTypes: MergeFieldTypes,
): { stringJoinKeyNames: string[] } => {
    const metaFor = (part: MergeJoinKeyPart): MergeFieldMeta | undefined =>
        Object.entries(part.fieldIdBySourceId)
            .map(([sourceId, fieldId]) => fieldTypes[sourceId]?.[fieldId])
            .find((candidate) => candidate !== undefined);
    return {
        stringJoinKeyNames: joinKey.flatMap((part) =>
            metaFor(part)?.type === DimensionType.STRING ? [part.name] : [],
        ),
    };
};

/** One sort term over the merged result, naming a merged column. */
export type MergeSort = {
    /** Column in the merged result, as `getColumns()` reports it. */
    column: string;
    descending: boolean;
};

/**
 * One already-compiled side of a merge. The SQL is whatever that query
 * compiles to on its own, so
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
 * Compiles several aggregated queries into one DuckDB statement: one CTE
 * per source, joined on a shared key. Null keys match each other: the join
 * compares with IS NOT DISTINCT FROM.
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

    private readonly stringJoinKeyNames: Set<string>;

    private readonly tableCalculations: MergeTableCalculation[];

    private readonly sorts: MergeSort[];

    constructor({
        sources,
        joinKeyNames,
        joinType,
        warehouseSqlBuilder,
        limit,
        tableCalculations,
        stringJoinKeyNames,
        sorts,
    }: {
        sources: MergeQuerySourceSql[];
        joinKeyNames: string[];
        joinType: MergeJoinType;
        warehouseSqlBuilder: WarehouseSqlBuilder;
        limit?: number;
        /** Calculations over the merged result. */
        tableCalculations?: MergeTableCalculation[];
        /** Sort the merged result. Defaults to the join key when omitted. */
        sorts?: MergeSort[];
        /** Keys modeled as strings. Cast source values before comparing so a
         * physically numeric column is comparable with a string. */
        stringJoinKeyNames?: string[];
    }) {
        this.sources = sources;
        this.joinKeyNames = joinKeyNames;
        this.joinType = joinType;
        this.warehouseSqlBuilder = warehouseSqlBuilder;
        this.limit = limit;
        this.stringJoinKeyNames = new Set(stringJoinKeyNames ?? []);
        this.tableCalculations = tableCalculations ?? [];
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
                    this.getComparableJoinKeyColumn(index, keyName),
                );
                return `COALESCE(${columns.join(', ')}) AS ${alias}`;
            }
            case MergeJoinType.LEFT:
            case MergeJoinType.INNER:
                return `${this.getComparableJoinKeyColumn(0, keyName)} AS ${alias}`;
            default:
                return assertUnreachable(
                    this.joinType,
                    `Unknown merge join type ${this.joinType}`,
                );
        }
    }

    private getComparableJoinKeyColumn(
        sourceIndex: number,
        keyName: string,
    ): string {
        const column = this.joinKeyColumnFor(sourceIndex, keyName);
        return this.stringJoinKeyNames.has(keyName)
            ? `CAST(${column} AS VARCHAR)`
            : column;
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
     * preceding sources rather than against the first one. Null-safe, so a
     * null key on both sides is one merged row rather than two unmatched
     * ones, whichever join type the user picks.
     */
    private getJoinCondition(sourceIndex: number): string {
        return this.joinKeyNames
            .map((keyName) => {
                const previous = this.sources
                    .slice(0, sourceIndex)
                    .map((_, index) =>
                        this.getComparableJoinKeyColumn(index, keyName),
                    );
                const left =
                    this.joinType === MergeJoinType.FULL && previous.length > 1
                        ? `COALESCE(${previous.join(', ')})`
                        : previous[0];
                const right = this.getComparableJoinKeyColumn(
                    sourceIndex,
                    keyName,
                );
                return `${left} IS NOT DISTINCT FROM ${right}`;
            })
            .join(' AND ');
    }

    /** Lowers the sources to IR nodes. Sources depend on nothing. */
    private lowerToIr(): MergeIrNode[] {
        return this.sources.map((source) => ({
            id: source.id,
            sql: source.sql,
            dependsOn: [],
        }));
    }

    /**
     * Emission order for the WITH chain: a CTE can only reference ones
     * declared before it. Sources have no edges today; a date-spine node will.
     */
    private static orderIrNodes(nodes: MergeIrNode[]): MergeIrNode[] {
        const ordered: MergeIrNode[] = [];
        const emitted = new Set<string>();
        const pending = [...nodes];
        while (pending.length > 0) {
            const nextAt = pending.findIndex((node) =>
                node.dependsOn.every((dependency) => emitted.has(dependency)),
            );
            if (nextAt === -1) {
                throw new Error('Merge IR nodes do not form a DAG.');
            }
            const [node] = pending.splice(nextAt, 1);
            ordered.push(node);
            emitted.add(node.id);
        }
        return ordered;
    }

    /** Non-source nodes are compiler-owned, so their id is their CTE name. */
    private cteNameFor(nodeId: string): string {
        const sourceIndex = this.sources.findIndex(
            (source) => source.id === nodeId,
        );
        return sourceIndex === -1 ? nodeId : this.cteNames[sourceIndex];
    }

    /** The join select: keys and values over the source CTEs. */
    private getMergeRowsSelect(): string {
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
        ];

        const joins = this.sources
            .slice(1)
            .map(
                (_, offset) =>
                    `${this.getJoinKeyword()} ${
                        this.cteNames[offset + 1]
                    } ON ${this.getJoinCondition(offset + 1)}`,
            );

        return [
            `SELECT ${selects.join(',\n       ')}`,
            `FROM ${this.cteNames[0]}`,
            ...joins,
        ].join('\n');
    }

    /**
     * The select over the spine and the merged rows. A FULL join with a
     * coalesced key is the shared empty-result guard: a merged row whose key
     * the spine misses survives the fill instead of vanishing, and an empty
     * merged result stays empty rather than erroring — one guard emitted
     * here, not one implicit behaviour per dialect.
     */
    private assembleCtes(nodes: MergeIrNode[]): string {
        return MergeQueryBuilder.orderIrNodes(nodes)
            .map((node) => `${this.cteNameFor(node.id)} AS (\n${node.sql}\n)`)
            .join(',\n');
    }

    /**
     * The composable core: a self-contained single-statement SELECT with no
     * ORDER BY and no LIMIT — clean under `SELECT *`, so it can back a
     * virtual view and be queried further. Everything terminal lives in the
     * wrapper.
     */
    toCoreSql(outputAliasByColumn?: Record<string, string>): string {
        const sourceNodes = this.lowerToIr();
        const sql = this.withTableCalculations(
            [
                `WITH ${this.assembleCtes(sourceNodes)}`,
                this.getMergeRowsSelect(),
            ].join('\n'),
        );
        return this.withOutputAliases(sql, outputAliasByColumn);
    }

    /**
     * The terminal stage the run path attaches over the core: sort and limit.
     * Ordered outside the calculation wrapper, so a sort can name a
     * calculated column and so the ordering is not left inside a subquery,
     * where the engine is free to discard it.
     */
    buildTerminalWrapper(
        outputAliasByColumn?: Record<string, string>,
    ): MergeTerminalWrapper {
        return {
            orderBy: this.getOrderBy(outputAliasByColumn),
            limit: this.limit ?? null,
            sourceLimitExceededSql: null,
        };
    }

    toSql(outputAliasByColumn?: Record<string, string>): string {
        return applyMergeTerminalWrapper(
            this.toCoreSql(outputAliasByColumn),
            this.buildTerminalWrapper(outputAliasByColumn),
        );
    }

    /**
     * Renames the statement's columns for whoever reads the results.
     *
     * Internal aliases are short and positional so that no composition of
     * source, field and pivot value can breach a warehouse identifier limit.
     * That keeps them safe but meaningless, and results keyed by a meaningless
     * name match no field downstream. Renaming once, in the outermost
     * projection, is where every other Lightdash query already names its
     * columns — one alias per output column, and no deeper layer to overflow.
     */
    private withOutputAliases(
        sql: string,
        outputAliasByColumn: Record<string, string> | undefined,
    ): string {
        if (!outputAliasByColumn) return sql;

        const projection = this.outputColumns().map((column) => {
            const alias = outputAliasByColumn[column];
            return alias === undefined || alias === column
                ? `merged_output.${this.quote(column)}`
                : `merged_output.${this.quote(column)} AS ${this.quote(alias)}`;
        });

        return [
            `SELECT ${projection.join(',\n       ')}`,
            `FROM (`,
            sql,
            `) AS merged_output`,
        ].join('\n');
    }

    /** Columns the core returns, in the order it returns them. */
    private outputColumns(): string[] {
        const columns = this.getColumns();
        return [
            ...columns.joinKeyColumns,
            ...Object.values(columns.valueColumnBySourceColumn).flatMap(
                (bySourceColumn) => Object.values(bySourceColumn),
            ),
            ...this.tableCalculations.map((calculation) => calculation.name),
        ];
    }

    /**
     * Sort terms for the merged result, in alias space.
     *
     * Defaults to the join key, which is the only ordering a merge has before
     * anyone asks for one.
     */
    private getOrderBy(
        outputAliasByColumn: Record<string, string> | undefined,
    ): string[] {
        // The ordering sits above the renaming projection, so it names the
        // columns by whatever they are called there.
        const outputName = (column: string) =>
            outputAliasByColumn?.[column] ?? column;

        if (this.sorts.length > 0) {
            return this.sorts.map(({ column, descending }) => {
                if (!this.orderableColumns().has(column)) {
                    throw new Error(
                        `Cannot sort the merged result by "${column}", which it has no column for.`,
                    );
                }
                return `${this.quote(outputName(column))}${
                    descending ? ' DESC' : ''
                }`;
            });
        }
        return this.joinKeyNames.map((keyName) =>
            this.quote(outputName(keyName)),
        );
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
     * place a row-wise calculation across two queries is meaningful.
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
}
