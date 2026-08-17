import {
    createVirtualView,
    isDimension,
    MERGE_TABLE_NAME,
    type Explore,
    type ItemsMap,
    type MergeTerminalWrapper,
    type MergeTypedColumn,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotConfiguration,
    type WarehouseClient,
} from '@lightdash/common';
import { applyMergeTerminalWrapper } from './MergeQueryBuilder';
import { type CompiledQuery } from './MetricQueryBuilder';
import { QueryComposer } from './QueryComposer';

export type MergeQueryComposerArguments = {
    /** Composable merge SQL, before presentation pivot and terminal checks. */
    coreSql: string;
    terminalWrapper: MergeTerminalWrapper;
    /** Every merged column as an ordinary field, keyed by field id. */
    itemsMap: ItemsMap;
    /** The compile's typed field list — the virtual view's column types. */
    typedColumns: MergeTypedColumn[];
    /** Field ids the merged result carries, in the order it returns them. */
    columnOrder: string[];
    limit: number;
    parameterReferences: string[];
    usedParametersValues: ParametersValuesMap;
    warehouseClient: WarehouseClient;
    /**
     * Standard pivot stage over the merged rows. Every merged dimension is a
     * join key part, so anything pivotable here is shared by both sources.
     */
    pivotConfiguration?: PivotConfiguration;
};

/**
 * Describes the merged result for result ordering and chart configuration.
 * It is a metadata carrier, never a query that can be compiled on its own.
 */
export const buildMergeResultMetricQuery = ({
    itemsMap,
    columnOrder,
    limit,
}: {
    itemsMap: ItemsMap;
    columnOrder: string[];
    limit: number;
}): MetricQuery => {
    const dimensions = columnOrder.filter((fieldId) => {
        const item = itemsMap[fieldId];
        return item !== undefined && isDimension(item);
    });

    return {
        exploreName: MERGE_TABLE_NAME,
        dimensions,
        metrics: columnOrder.filter((fieldId) => !dimensions.includes(fieldId)),
        filters: {},
        sorts: [],
        limit,
        tableCalculations: [],
    };
};

/**
 * QueryComposer for merged queries.
 *
 * A merge compiles two metric queries into one statement, so there is no
 * single metric query to compile here — the SQL arrives already built. What
 * this adds is the identity the rest of the execute path reads off a composer:
 * the merged items map as `fields`, and a metric query that describes the
 * merged result well enough for column ordering and the chart config.
 *
 * The metric query is a metadata carrier, not something anyone can re-run.
 * Its explore name is a sentinel rather than either source's, so code that
 * tries to load an explore from it fails loudly instead of silently compiling
 * against one side of the join.
 */
export class MergeQueryComposer extends QueryComposer {
    private readonly mergedSql: string;

    private readonly mergedItemsMap: ItemsMap;

    private readonly terminalWrapper: MergeTerminalWrapper;

    private readonly parameterReferences: Set<string>;

    private readonly usedParametersValues: ParametersValuesMap;

    constructor(args: MergeQueryComposerArguments) {
        const {
            coreSql,
            terminalWrapper,
            itemsMap,
            typedColumns,
            columnOrder,
            limit,
            parameterReferences,
            usedParametersValues,
            warehouseClient,
            pivotConfiguration,
        } = args;

        super(
            {
                metricQuery: buildMergeResultMetricQuery({
                    itemsMap,
                    columnOrder,
                    limit,
                }),
                pivotConfiguration,
            },
            {
                explore: MergeQueryComposer.buildVirtualView(
                    coreSql,
                    typedColumns,
                    warehouseClient,
                ),
                warehouseSqlBuilder: warehouseClient,
                // The pivot resolves field metadata against the merged items
                // map — there is no freshly compiled metric query to fall
                // back on.
                pivotItemsMap: itemsMap,
                displayTimezone: null,
            },
        );
        this.mergedSql = coreSql;
        this.mergedItemsMap = itemsMap;
        this.terminalWrapper = terminalWrapper;
        this.parameterReferences = new Set(parameterReferences);
        this.usedParametersValues = usedParametersValues;
    }

    /** The merged statement is already compiled; nothing recompiles it. */
    protected computeCompiled(): CompiledQuery {
        return {
            query: this.mergedSql,
            fields: this.mergedItemsMap,
            warnings: [],
            parameterReferences: this.parameterReferences,
            missingParameterReferences: new Set(),
            usedParameters: this.usedParametersValues,
            compilationErrors: [],
        };
    }

    protected finalizeSql(sql: string, isPivoted: boolean): string {
        return applyMergeTerminalWrapper(sql, {
            ...this.terminalWrapper,
            // PivotQueryBuilder owns presentation ordering and limiting once
            // present. The source-cap assertion must remain outermost.
            ...(isPivoted ? { orderBy: [], limit: null } : {}),
        });
    }

    /**
     * A view over the merged statement. Only its name and warehouse routing
     * are read downstream — the fields come from the merged items map, not
     * from compiling this. Column types come from the compile's typed field
     * list, which resolved each merged column from the field it came from.
     */
    private static buildVirtualView(
        sql: string,
        typedColumns: MergeTypedColumn[],
        warehouseClient: WarehouseClient,
    ): Explore {
        return createVirtualView(
            MERGE_TABLE_NAME,
            sql,
            typedColumns.map(({ reference, type }) => ({ reference, type })),
            warehouseClient,
        );
    }
}
