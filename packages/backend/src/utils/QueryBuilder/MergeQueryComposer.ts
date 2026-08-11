import {
    createVirtualView,
    DimensionType,
    isDimension,
    type Explore,
    type ItemsMap,
    type MetricQuery,
    type PivotConfiguration,
    type WarehouseClient,
} from '@lightdash/common';
import { type CompiledQuery } from './MetricQueryBuilder';
import { QueryComposer } from './QueryComposer';

/** Explore name a merged result reports. Deliberately not either source's. */
export const MERGE_EXPLORE_NAME = 'merge';

export type MergeQueryComposerArguments = {
    /** The compiled merged statement, from `ProjectService.compileMergeQuery`. */
    sql: string;
    /** Every merged column as an ordinary field, keyed by field id. */
    itemsMap: ItemsMap;
    /** Field ids the merged result carries, in the order it returns them. */
    columnOrder: string[];
    limit: number;
    warehouseClient: WarehouseClient;
    /**
     * Standard pivot stage over the merged rows. Every merged dimension is a
     * join key part, so anything pivotable here is shared by both sources.
     */
    pivotConfiguration?: PivotConfiguration;
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

    constructor(args: MergeQueryComposerArguments) {
        const {
            sql,
            itemsMap,
            columnOrder,
            limit,
            warehouseClient,
            pivotConfiguration,
        } = args;

        super(
            {
                metricQuery: MergeQueryComposer.buildMetricQuery(
                    itemsMap,
                    columnOrder,
                    limit,
                ),
                pivotConfiguration,
            },
            {
                explore: MergeQueryComposer.buildVirtualView(
                    sql,
                    itemsMap,
                    columnOrder,
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
        this.mergedSql = sql;
        this.mergedItemsMap = itemsMap;
    }

    /** The merged statement is already compiled; nothing recompiles it. */
    protected computeCompiled(): CompiledQuery {
        return {
            query: this.mergedSql,
            fields: this.mergedItemsMap,
            warnings: [],
            parameterReferences: new Set(),
            missingParameterReferences: new Set(),
            usedParameters: {},
            compilationErrors: [],
        };
    }

    /**
     * Describes the merged result for column ordering and the chart config.
     * Filters and sorts stay empty: the real filters live on the source
     * queries, and echoing them here invites a consumer to apply them twice.
     */
    private static buildMetricQuery(
        itemsMap: ItemsMap,
        columnOrder: string[],
        limit: number,
    ): MetricQuery {
        const dimensions = columnOrder.filter((fieldId) => {
            const item = itemsMap[fieldId];
            return item !== undefined && isDimension(item);
        });

        return {
            exploreName: MERGE_EXPLORE_NAME,
            dimensions,
            metrics: columnOrder.filter(
                (fieldId) => !dimensions.includes(fieldId),
            ),
            filters: {},
            sorts: [],
            limit,
            tableCalculations: [],
        };
    }

    /**
     * A view over the merged statement. Only its name and warehouse routing
     * are read downstream — the fields come from the merged items map, not
     * from compiling this.
     */
    private static buildVirtualView(
        sql: string,
        itemsMap: ItemsMap,
        columnOrder: string[],
        warehouseClient: WarehouseClient,
    ): Explore {
        const columns = columnOrder.map((fieldId) => {
            const item = itemsMap[fieldId];
            return {
                reference: fieldId,
                type:
                    item !== undefined && isDimension(item)
                        ? item.type
                        : DimensionType.NUMBER,
            };
        });

        return createVirtualView(
            MERGE_EXPLORE_NAME,
            sql,
            columns,
            warehouseClient,
        );
    }
}
