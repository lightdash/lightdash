import {
    addDashboardFiltersToMetricQuery,
    convertFieldRefToFieldId,
    createVirtualView,
    getDashboardFilterRulesForTileAndReferences,
    getItemMap,
    type DashboardFilters,
    type DimensionType,
    type Explore,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotConfiguration,
    type SortField,
    type WarehouseClient,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { CompiledQuery } from './MetricQueryBuilder';
import { QueryComposer } from './QueryComposer';
import { ReferenceMap, SqlQueryBuilder } from './SqlQueryBuilder';

/** Explore name used for the virtual view that wraps a SQL chart's user SQL. */
export const SQL_QUERY_MOCK_EXPLORER_NAME = 'sql_query_explorer';

/** A column discovered from running the user SQL. */
export type SqlQueryColumn = { name: string; type: DimensionType };

/** Raw inputs the SQL composer builds everything from. */
export type SqlQueryComposerArguments = {
    /** User SQL with user attributes already replaced. */
    userSql: string;
    columns: SqlQueryColumn[];
    warehouseClient: WarehouseClient;
    pivotConfiguration: PivotConfiguration | undefined;
    limit: number | undefined;
    parameters: ParametersValuesMap | undefined;
    /** Dashboard-tile context, only set on the dashboard SQL-chart path. */
    dashboardFilters: DashboardFilters | undefined;
    tileUuid: string | undefined;
    dashboardSorts: SortField[] | undefined;
};

/**
 * QueryComposer for SQL charts. SQL charts don't compile a metric query — they
 * run user-written SQL — so this wraps that SQL in a SqlQueryBuilder and carries
 * a mock MetricQuery as metadata. The pivot pipeline (getSql) is inherited from
 * the base facade so metric queries and SQL charts share one getSql() seam.
 */
export class SqlQueryComposer extends QueryComposer {
    private readonly sqlQueryBuilder: SqlQueryBuilder;

    private readonly appliedDashboardFilters: DashboardFilters | undefined;

    constructor(args: SqlQueryComposerArguments) {
        const built = SqlQueryComposer.build(args);
        // SQL charts override computeCompiled, so only the explore and warehouse
        // builder (used by the inherited getSql) are needed — the metric-compile
        // context fields are omitted. SQL charts have no display timezone.
        super(
            {
                metricQuery: built.metricQuery,
                pivotConfiguration: args.pivotConfiguration,
            },
            {
                explore: built.virtualView,
                warehouseSqlBuilder: args.warehouseClient,
                parameters: args.parameters,
                displayTimezone: null,
            },
        );
        this.sqlQueryBuilder = built.sqlQueryBuilder;
        this.appliedDashboardFilters = built.appliedDashboardFilters;
    }

    /** Shape the wrapped user SQL into a CompiledQuery. */
    protected computeCompiled(): CompiledQuery {
        const {
            sql,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
        } = this.sqlQueryBuilder.getSqlAndReferences();

        return {
            query: sql,
            fields: getItemMap(this.context.explore),
            warnings: [],
            parameterReferences: new Set(parameterReferences),
            missingParameterReferences: new Set(missingParameterReferences),
            usedParameters,
            compilationErrors: [],
        };
    }

    /** Dashboard filters actually applied to the SQL, for the response echo. */
    getAppliedDashboardFilters(): DashboardFilters | undefined {
        return this.appliedDashboardFilters;
    }

    private static build(args: SqlQueryComposerArguments): {
        virtualView: Explore;
        metricQuery: MetricQuery;
        sqlQueryBuilder: SqlQueryBuilder;
        appliedDashboardFilters: DashboardFilters | undefined;
    } {
        const {
            userSql,
            columns,
            warehouseClient,
            limit,
            parameters,
            dashboardFilters,
            tileUuid,
            dashboardSorts,
        } = args;

        const vizColumns = columns.map((col) => ({
            reference: col.name,
            type: col.type,
        }));

        const virtualView = createVirtualView(
            SQL_QUERY_MOCK_EXPLORER_NAME,
            userSql,
            vizColumns,
            warehouseClient,
        );

        const dimensions = Object.values(
            virtualView.tables[virtualView.baseTable].dimensions,
        ).map((d) => convertFieldRefToFieldId(d.name, virtualView.name));

        const fieldQuoteChar = warehouseClient.getFieldQuoteChar();

        const referenceMap: ReferenceMap = {};
        vizColumns.forEach((col) => {
            referenceMap[col.reference] = {
                type: col.type,
                sql: `${fieldQuoteChar}${col.reference}${fieldQuoteChar}`,
            };
        });

        let metricQuery: MetricQuery = {
            exploreName: virtualView.name,
            dimensions,
            metrics: [],
            filters: {},
            tableCalculations: [],
            sorts: [],
            customDimensions: [],
            additionalMetrics: [],
            limit: limit ?? 500,
        };

        let appliedDashboardFilters: DashboardFilters | undefined;
        if (dashboardFilters && tileUuid) {
            appliedDashboardFilters = {
                dimensions: getDashboardFilterRulesForTileAndReferences(
                    tileUuid,
                    Object.keys(referenceMap),
                    dashboardFilters.dimensions,
                ),
                metrics: [],
                tableCalculations: [],
            };

            // SQL charts don't support filters yet; kept for future use.
            metricQuery = addDashboardFiltersToMetricQuery(
                metricQuery,
                appliedDashboardFilters,
                virtualView,
            );
        }
        if (dashboardSorts) {
            metricQuery = {
                ...metricQuery,
                sorts: dashboardSorts.length > 0 ? dashboardSorts : [],
            };
        }

        const sqlQueryBuilder = new SqlQueryBuilder(
            {
                referenceMap,
                select: vizColumns.map((col) => col.reference),
                from: { name: 'sql_query', sql: userSql },
                filters: appliedDashboardFilters
                    ? {
                          id: uuidv4(),
                          and: appliedDashboardFilters.dimensions,
                      }
                    : undefined,
                parameters,
                limit,
            },
            {
                fieldQuoteChar,
                stringQuoteChar: warehouseClient.getStringQuoteChar(),
                escapeStringQuoteChar:
                    warehouseClient.getEscapeStringQuoteChar(),
                startOfWeek: warehouseClient.getStartOfWeek(),
                adapterType: warehouseClient.getAdapterType(),
                escapeString:
                    warehouseClient.escapeString.bind(warehouseClient),
            },
        );

        return {
            virtualView,
            metricQuery,
            sqlQueryBuilder,
            appliedDashboardFilters,
        };
    }
}
