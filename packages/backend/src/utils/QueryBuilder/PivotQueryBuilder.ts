import {
    getAggregatedField,
    MAX_PIVOT_COLUMN_LIMIT,
    normalizeIndexColumns,
    ParameterError,
    type PivotConfiguration,
    SortByDirection,
    WarehouseSqlBuilder,
} from '@lightdash/common';

export class PivotQueryBuilder {
    private readonly sql: string;

    private readonly pivotConfiguration: PivotConfiguration;

    private readonly limit: number | undefined;

    private readonly warehouseSqlBuilder: WarehouseSqlBuilder;

    constructor(
        sql: string,
        pivotConfiguration: PivotConfiguration,
        warehouseSqlBuilder: WarehouseSqlBuilder,
        limit?: number,
    ) {
        this.sql = sql;
        this.pivotConfiguration = pivotConfiguration;
        this.limit = limit;
        this.warehouseSqlBuilder = warehouseSqlBuilder;
    }

    static buildCtesSQL(ctes: string[]): string {
        return ctes.length > 0 ? `WITH ${ctes.join(',\n')}` : '';
    }

    static assembleSqlParts(parts: Array<string | undefined>): string {
        return parts.filter((part) => part !== undefined).join('\n');
    }

    private static buildIndexColumnsOrderBy(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        sortBy: PivotConfiguration['sortBy'],
        q: string,
    ): string {
        return indexColumns
            .map((col) => {
                const sortDirection =
                    sortBy?.find((s) => s.reference === col.reference)
                        ?.direction === SortByDirection.DESC
                        ? 'DESC'
                        : 'ASC';
                return `${q}${col.reference}${q} ${sortDirection}`;
            })
            .join(', ');
    }

    private static calculateMaxColumnsPerValueColumn(
        valuesColumns: PivotConfiguration['valuesColumns'],
    ): number {
        const valueColumnsCount = valuesColumns?.length || 1;
        const remainingColumns = MAX_PIVOT_COLUMN_LIMIT - 1; // Account for the index column
        return Math.floor(remainingColumns / valueColumnsCount);
    }

    private getOrderBySQL(sortBy: PivotConfiguration['sortBy']): string {
        if (!sortBy?.length) return '';

        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        return `ORDER BY ${sortBy
            .map((s) => `${q}${s.reference}${q} ${s.direction}`)
            .join(', ')}`;
    }

    private getGroupByQuerySQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: PivotConfiguration['groupByColumns'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        const groupBySelectDimensions = [
            ...(groupByColumns || []).map((col) => `${q}${col.reference}${q}`),
            ...indexColumns.map((col) => `${q}${col.reference}${q}`),
        ];

        const groupBySelectMetrics = [
            ...(valuesColumns ?? []).map((col) => {
                const aggregationField = getAggregatedField(
                    this.warehouseSqlBuilder,
                    col.aggregation,
                    col.reference,
                );
                return `${aggregationField} AS ${q}${col.reference}_${col.aggregation}${q}`;
            }),
        ];

        return `SELECT ${[
            ...new Set(groupBySelectDimensions), // Remove duplicate columns
            ...groupBySelectMetrics,
        ].join(', ')} FROM original_query group by ${Array.from(
            new Set(groupBySelectDimensions),
        ).join(', ')}`;
    }

    private getPivotQuerySQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        const selectReferences = [
            ...indexColumns.map((col) => col.reference),
            ...groupByColumns.map((col) => `${q}${col.reference}${q}`),
            ...(valuesColumns || []).map(
                (col) => `${q}${col.reference}_${col.aggregation}${q}`,
            ),
        ];

        const indexColumnsOrderBy = PivotQueryBuilder.buildIndexColumnsOrderBy(
            indexColumns,
            sortBy,
            q,
        );

        return `SELECT ${selectReferences.join(
            ', ',
        )}, dense_rank() over (order by ${indexColumnsOrderBy}) as ${q}row_index${q}, dense_rank() over (order by ${q}${
            groupByColumns[0]?.reference
        }${q}) as ${q}column_index${q} FROM group_by_query`;
    }

    private getFullPivotSQL(
        userSql: string,
        groupByQuery: string,
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const rowLimit = this.limit ?? 500;

        const pivotQuery = this.getPivotQuerySQL(
            indexColumns,
            valuesColumns,
            groupByColumns,
            sortBy,
        );
        const maxColumnsPerValueColumn =
            PivotQueryBuilder.calculateMaxColumnsPerValueColumn(valuesColumns);

        const ctes = [
            `original_query AS (${userSql})`,
            `group_by_query AS (${groupByQuery})`,
            `pivot_query AS (${pivotQuery})`,
            `filtered_rows AS (SELECT * FROM pivot_query WHERE ${q}row_index${q} <= ${rowLimit})`,
            `total_columns AS (SELECT (COUNT(DISTINCT ${groupByColumns
                .map((col) => `filtered_rows.${q}${col.reference}${q}`)
                .join(', ')}) * ${
                valuesColumns?.length || 1
            }) as total_columns FROM filtered_rows)`,
        ];

        const finalSelect = `SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p.${q}row_index${q} <= ${rowLimit} and p.${q}column_index${q} <= ${maxColumnsPerValueColumn} order by p.${q}row_index${q}, p.${q}column_index${q}`;

        return PivotQueryBuilder.assembleSqlParts([
            PivotQueryBuilder.buildCtesSQL(ctes),
            finalSelect,
        ]);
    }

    private getSimpleQuerySQL(
        userSql: string,
        groupByQuery: string,
        sortBy: PivotConfiguration['sortBy'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const orderBy = this.getOrderBySQL(sortBy);
        const ctes = [
            `original_query AS (${userSql})`,
            `group_by_query AS (${groupByQuery})`,
        ];

        return PivotQueryBuilder.assembleSqlParts([
            PivotQueryBuilder.buildCtesSQL(ctes),
            `SELECT * FROM group_by_query${
                orderBy ? ` ${orderBy}` : ''
            } LIMIT ${this.limit ?? 500}`,
        ]);
    }

    toSql(): string {
        const indexColumns = normalizeIndexColumns(
            this.pivotConfiguration.indexColumn,
        );
        if (indexColumns.length === 0) {
            throw new ParameterError(
                'At least one valid index column is required',
            );
        }
        const { valuesColumns, groupByColumns, sortBy } =
            this.pivotConfiguration;

        const userSql = this.sql.replace(/;\s*$/, '');
        const groupByQuery = this.getGroupByQuerySQL(
            indexColumns,
            valuesColumns,
            groupByColumns,
        );

        if (groupByColumns && groupByColumns.length > 0) {
            return this.getFullPivotSQL(
                userSql,
                groupByQuery,
                indexColumns,
                valuesColumns,
                groupByColumns,
                sortBy,
            );
        }

        return this.getSimpleQuerySQL(userSql, groupByQuery, sortBy);
    }
}
