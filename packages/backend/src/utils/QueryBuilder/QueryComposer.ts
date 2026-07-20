import {
    getFieldFormatOverrideProps,
    getMetricOverridesWithPopInheritance,
    mergeReservedDefinitions,
    mergeReservedValues,
    resolveReservedParameterValues,
    type DateZoom,
    type Explore,
    type IntrinsicUserAttributes,
    type ItemsMap,
    type MetricQuery,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type PivotConfiguration,
    type QueryWarning,
    type UserAccessControls,
    type UserAttributeValueMap,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileMetricQuery } from '../../queryCompiler';
import { wrapSentryTransactionSync } from '../../utils';
import { updateExploreWithDateZoom } from './dateZoom';
import { CompiledQuery, MetricQueryBuilder } from './MetricQueryBuilder';
import { PivotQueryBuilder } from './PivotQueryBuilder';
import { TotalQueryBuilder, TotalQueryKind } from './TotalQueryBuilder';

/**
 * Turns the source query into a totals query. When set on the definition, the
 * composer collapses `metricQuery` + `pivotConfiguration` into the requested
 * grain (grand/row/column/subtotal) via `TotalQueryBuilder` before compiling.
 */
export type TotalConfiguration = {
    kind: TotalQueryKind;
    // Required only for `columnSubtotal`; undefined for every other kind.
    subtotalDimensions: string[] | undefined;
};

/** What to compile: the metric query and, optionally, how to pivot it. */
export type QueryComposerDefinition = {
    metricQuery: MetricQuery;
    pivotConfiguration?: PivotConfiguration;
    // When set, the composer builds the totals query for this grain instead of
    // the source query. Mutually exclusive with dashboard filters (totals only
    // arrive from the internal calculate-total path, which never sets them).
    totalConfiguration?: TotalConfiguration;
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
    /**
     * itemsMap the pivot resolves field metadata against. Defaults to the
     * freshly compiled fields when undefined; pre-agg supplies the source
     * query's persisted fields instead.
     */
    pivotItemsMap?: ItemsMap;
    continueOnError?: boolean;
    useTimezoneAwareDateTrunc?: boolean;
    columnTimezone?: string;
    rebaseRawTimestampFilters?: boolean;
    applyDateZoomToFilters?: boolean;
    /**
     * Flag-gated timezone echoed to clients and persisted with the query.
     * Not a compile input — `timezone` drives SQL. SQL charts set it to null.
     */
    displayTimezone?: string | null;
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

    private effectiveDefinition:
        | {
              metricQuery: MetricQuery;
              pivotConfiguration: PivotConfiguration | undefined;
          }
        | undefined;

    constructor(
        definition: QueryComposerDefinition,
        context: QueryComposerContext,
    ) {
        this.definition = definition;
        this.context = context;
    }

    /**
     * The query the composer actually compiles: the totals-collapsed query when
     * a `totalConfiguration` is set, otherwise the source query. Memoized.
     */
    private getEffectiveDefinition(): {
        metricQuery: MetricQuery;
        pivotConfiguration: PivotConfiguration | undefined;
    } {
        if (this.effectiveDefinition) {
            return this.effectiveDefinition;
        }

        const { metricQuery, pivotConfiguration, totalConfiguration } =
            this.definition;

        if (!totalConfiguration) {
            this.effectiveDefinition = { metricQuery, pivotConfiguration };
            return this.effectiveDefinition;
        }

        this.effectiveDefinition = new TotalQueryBuilder({
            metricQuery,
            pivotConfiguration: pivotConfiguration ?? null,
            kind: totalConfiguration.kind,
            subtotalDimensions: totalConfiguration.subtotalDimensions,
        }).compileQuery();
        return this.effectiveDefinition;
    }

    /** The explore the query runs against. */
    getExplore(): Explore {
        return this.context.explore;
    }

    /** The effective (totals-collapsed) metric query the composer compiles. */
    getMetricQuery(): MetricQuery {
        return this.getEffectiveDefinition().metricQuery;
    }

    /** The effective (totals-collapsed) pivot configuration, if any. */
    getPivotConfiguration(): PivotConfiguration | undefined {
        return this.getEffectiveDefinition().pivotConfiguration;
    }

    /**
     * Compiled fields with metric/dimension format overrides applied.
     * Overrides live on the source query; PoP metric overrides inherit from
     * their base metric.
     */
    getFields(): ItemsMap {
        const { fields } = this.compile();
        const sourceMetricQuery = this.definition.metricQuery;
        const resolvedMetricOverrides =
            getMetricOverridesWithPopInheritance(sourceMetricQuery);

        return Object.fromEntries(
            Object.entries(fields).map(([key, value]) => {
                const override =
                    resolvedMetricOverrides[key] ||
                    sourceMetricQuery.dimensionOverrides?.[key];
                const formatOptions = override?.formatOptions;
                if (formatOptions) {
                    return [
                        key,
                        {
                            ...value,
                            ...getFieldFormatOverrideProps(formatOptions),
                        },
                    ];
                }
                return [key, value];
            }),
        );
    }

    /** Resolved timezone the SQL was compiled with. */
    getTimezone(): string | undefined {
        return this.context.timezone;
    }

    /** Flag-gated timezone echoed to clients and persisted with the query. */
    getDisplayTimezone(): string | null {
        return this.context.displayTimezone ?? null;
    }

    getDateZoom(): DateZoom | undefined {
        return this.context.dateZoom;
    }

    /** Raw combined parameter values (not the reserved-merged compile variant). */
    getParameters(): ParametersValuesMap | undefined {
        return this.context.parameters;
    }

    getUserAccessControls(): UserAccessControls | undefined {
        const { userAttributes, intrinsicUserAttributes } = this.context;
        if (
            userAttributes === undefined ||
            intrinsicUserAttributes === undefined
        ) {
            return undefined;
        }
        return { userAttributes, intrinsicUserAttributes };
    }

    getAvailableParameterDefinitions(): ParameterDefinitions | undefined {
        return this.context.availableParameterDefinitions;
    }

    getUseTimezoneAwareDateTrunc(): boolean {
        return this.context.useTimezoneAwareDateTrunc ?? false;
    }

    getWarnings(): QueryWarning[] {
        return this.compile().warnings;
    }

    getUsedParameters(): ParametersValuesMap {
        return this.compile().usedParameters;
    }

    getParameterReferences(): string[] {
        return Array.from(this.compile().parameterReferences);
    }

    getMissingParameterReferences(): string[] {
        return Array.from(this.compile().missingParameterReferences);
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
        const { metricQuery, pivotConfiguration } =
            this.getEffectiveDefinition();
        // Date zoom targets the source query's dimensions; it rewrites the
        // explore, not the metric query, and stays inert when the collapsed
        // totals query doesn't select the zoom dimension.
        const sourceMetricQuery = this.definition.metricQuery;
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
            rebaseRawTimestampFilters,
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
            sourceMetricQuery,
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
            rebaseRawTimestampFilters,
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
        const { metricQuery, pivotConfiguration } =
            this.getEffectiveDefinition();

        if (!pivotConfiguration) {
            return compiledQuery.query;
        }

        const pivotQueryBuilder = new PivotQueryBuilder(
            compiledQuery.query,
            pivotConfiguration,
            this.context.warehouseSqlBuilder,
            metricQuery.limit,
            this.context.pivotItemsMap ?? compiledQuery.fields,
        );
        return pivotQueryBuilder.toSql({ columnLimit });
    }
}
