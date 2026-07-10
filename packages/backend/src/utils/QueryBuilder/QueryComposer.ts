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

/**
 * Raw inputs the composer needs to prepare context and build SQL. Only
 * `explore` and `warehouseSqlBuilder` are always needed; the rest drive the
 * metric-compile path and are optional so SQL charts (which override
 * `computeCompiled`) can omit them.
 */
export type QueryComposerContext = {
    explore: Explore;
    warehouseSqlBuilder: WarehouseSqlBuilder;
    intrinsicUserAttributes?: IntrinsicUserAttributes;
    userAttributes?: UserAttributeValueMap;
    timezone?: string;
    availableParameterDefinitions?: ParameterDefinitions;
    parameters?: ParametersValuesMap;
    dateZoom?: DateZoom;
    pivotDimensions?: string[];
    continueOnError?: boolean;
    useTimezoneAwareDateTrunc?: boolean;
    columnTimezone?: string;
    applyDateZoomToFilters?: boolean;
};

/**
 * Facade that owns metric SQL generation end-to-end. It prepares the query
 * context internally (reserved-parameter merge, date-zoom explore rewrite,
 * metric-query compilation) and orchestrates MetricQueryBuilder and
 * PivotQueryBuilder — it does not generate SQL itself.
 */
export class QueryComposer {
    protected readonly definition: QueryComposerDefinition;

    protected readonly context: QueryComposerContext;

    protected compiledQuery: CompiledQuery | undefined;

    constructor(
        definition: QueryComposerDefinition,
        context: QueryComposerContext,
    ) {
        this.definition = definition;
        this.context = context;
    }

    /** Compile to base SQL, memoized. Delegates to the overridable seam. */
    compile(): CompiledQuery {
        if (this.compiledQuery) {
            return this.compiledQuery;
        }
        this.compiledQuery = this.computeCompiled();
        return this.compiledQuery;
    }

    /**
     * Produce the base CompiledQuery. Subclasses override this to compile from
     * different inputs (e.g. SQL charts wrap user SQL instead of a metric query).
     */
    protected computeCompiled(): CompiledQuery {
        const { metricQuery, pivotConfiguration } = this.definition;
        const {
            explore,
            warehouseSqlBuilder,
            // Always supplied on the metric-compile path; defaulted so the
            // optional context type stays satisfied.
            intrinsicUserAttributes = {},
            userAttributes = {},
            timezone = '',
            availableParameterDefinitions = {},
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

        return wrapSentryTransactionSync('QueryBuilder.buildQuery', {}, () =>
            queryBuilder.compileQuery(),
        );
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

    /** The explore the query runs against. */
    getExplore(): Explore {
        return this.context.explore;
    }

    getMetricQuery(): MetricQuery {
        return this.definition.metricQuery;
    }

    getPivotConfiguration(): PivotConfiguration | undefined {
        return this.definition.pivotConfiguration;
    }
}
