import {
    mergeReservedDefinitions,
    mergeReservedValues,
    resolveReservedParameterValues,
    type DateZoom,
    type Explore,
    type IntrinsicUserAttributes,
    type MetricQuery,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type PivotConfiguration,
    type UserAttributeValueMap,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileMetricQuery } from '../../queryCompiler';
import { wrapSentryTransactionSync } from '../../utils';
import { updateExploreWithDateZoom } from './dateZoom';
import { CompiledQuery, MetricQueryBuilder } from './MetricQueryBuilder';
import { PivotQueryBuilder } from './PivotQueryBuilder';

/** What to compile: the metric query and, optionally, how to pivot it. */
export type QueryComposerDefinition = {
    metricQuery: MetricQuery;
    pivotConfiguration: PivotConfiguration | undefined;
};

/** Raw inputs the composer needs to prepare context and build SQL. */
export type QueryComposerContext = {
    explore: Explore;
    warehouseSqlBuilder: WarehouseSqlBuilder;
    intrinsicUserAttributes: IntrinsicUserAttributes;
    userAttributes: UserAttributeValueMap;
    timezone: string;
    availableParameterDefinitions: ParameterDefinitions;
    parameters: ParametersValuesMap | undefined;
    dateZoom: DateZoom | undefined;
    pivotDimensions: string[] | undefined;
    continueOnError: boolean | undefined;
    useTimezoneAwareDateTrunc: boolean | undefined;
    columnTimezone: string | undefined;
    applyDateZoomToFilters: boolean | undefined;
};

/**
 * Facade that owns metric SQL generation end-to-end. It prepares the query
 * context internally (reserved-parameter merge, date-zoom explore rewrite,
 * metric-query compilation) and orchestrates MetricQueryBuilder and
 * PivotQueryBuilder — it does not generate SQL itself.
 */
export class QueryComposer {
    private readonly definition: QueryComposerDefinition;

    private readonly context: QueryComposerContext;

    private compiledQuery: CompiledQuery | undefined;

    constructor(
        definition: QueryComposerDefinition,
        context: QueryComposerContext,
    ) {
        this.definition = definition;
        this.context = context;
    }

    /** Compile the metric query to base SQL. Memoized. */
    compile(): CompiledQuery {
        if (this.compiledQuery) {
            return this.compiledQuery;
        }

        const { metricQuery, pivotConfiguration } = this.definition;
        const {
            explore,
            warehouseSqlBuilder,
            intrinsicUserAttributes,
            userAttributes,
            timezone,
            availableParameterDefinitions,
            parameters,
            dateZoom,
            pivotDimensions,
            continueOnError,
            useTimezoneAwareDateTrunc,
            columnTimezone,
            applyDateZoomToFilters,
        } = this.context;

        // Fold reserved definitions in so custom SQL referencing them compiles; a
        // same-named user parameter wins (shadows the reserved one).
        const parameterDefinitionsWithReserved: ParameterDefinitions =
            mergeReservedDefinitions(availableParameterDefinitions);
        const availableParameters = Object.keys(
            parameterDefinitionsWithReserved,
        );

        const {
            explore: exploreWithOverride,
            dateZoomApplied,
            dateZoomTargetFieldId,
        } = updateExploreWithDateZoom(
            explore,
            metricQuery,
            warehouseSqlBuilder,
            availableParameters,
            dateZoom,
        );

        // Resolve reserved values from the query context (date zoom reflects the
        // selected grain whenever a zoom reaches the query); a same-named user
        // value wins.
        const parametersWithReserved: ParametersValuesMap = mergeReservedValues(
            parameters,
            resolveReservedParameterValues({ dateZoom }),
        );

        const compiledMetricQuery = compileMetricQuery({
            explore: exploreWithOverride,
            metricQuery,
            warehouseSqlBuilder,
            availableParameters,
        });

        const queryBuilder = new MetricQueryBuilder({
            explore: exploreWithOverride,
            compiledMetricQuery,
            warehouseSqlBuilder,
            intrinsicUserAttributes,
            userAttributes,
            timezone,
            parameters: parametersWithReserved,
            parameterDefinitions: parameterDefinitionsWithReserved,
            pivotConfiguration,
            pivotDimensions,
            continueOnError,
            originalExplore: dateZoom ? explore : undefined,
            dateZoomFilterTargetFieldId:
                applyDateZoomToFilters && dateZoomApplied
                    ? dateZoomTargetFieldId
                    : undefined,
            useTimezoneAwareDateTrunc,
            columnTimezone,
        });

        this.compiledQuery = wrapSentryTransactionSync(
            'QueryBuilder.buildQuery',
            {},
            () => queryBuilder.compileQuery(),
        );
        return this.compiledQuery;
    }

    /**
     * SQL for the query — PivotQueryBuilder-wrapped when a pivot config is set,
     * otherwise the base query.
     */
    getSql({ columnLimit }: { columnLimit: number }): string {
        const compiledQuery = this.compile();
        const { metricQuery, pivotConfiguration } = this.definition;

        if (!pivotConfiguration) {
            return compiledQuery.query;
        }

        const pivotQueryBuilder = new PivotQueryBuilder(
            compiledQuery.query,
            pivotConfiguration,
            this.context.warehouseSqlBuilder,
            metricQuery.limit,
            compiledQuery.fields,
        );
        return pivotQueryBuilder.toSql({ columnLimit });
    }
}
