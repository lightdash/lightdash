import {
    getFieldFormatOverrideProps,
    getMetricOverridesWithPopInheritance,
    mergeReservedDefinitions,
    mergeReservedValues,
    normalizeIndexColumns,
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
import { TotalConfiguration } from './utils';

export type { TotalConfiguration } from './utils';

/** What to compile: the metric query and, optionally, how to pivot it. */
export type QueryComposerDefinition = {
    metricQuery: MetricQuery;
    pivotConfiguration?: PivotConfiguration;
    // When set, MetricQueryBuilder builds the totals query for this grain
    // instead of the source query. Mutually exclusive with dashboard filters
    // (totals only arrive from the internal calculate-total path, which never
    // sets them).
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
    dataTimezone?: string;
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
 * PivotQueryBuilder — it does not generate SQL itself. Totals are entirely
 * MetricQueryBuilder's job: the composer just forwards `totalConfiguration`
 * and reads the effective (collapsed) query back from the builder.
 */
export class QueryComposer {
    protected readonly definition: QueryComposerDefinition;

    protected readonly context: QueryComposerContext;

    protected compiledQuery: CompiledQuery | undefined;

    private queryBuilder: MetricQueryBuilder | undefined;

    constructor(
        definition: QueryComposerDefinition,
        context: QueryComposerContext,
    ) {
        this.definition = definition;
        this.context = context;
    }

    /**
     * Prepares the compile context (reserved parameters, date-zoom explore
     * rewrite, metric-query compilation) and constructs the builder. Memoized.
     */
    private getQueryBuilder(): MetricQueryBuilder {
        if (this.queryBuilder) {
            return this.queryBuilder;
        }

        const { metricQuery, pivotConfiguration, totalConfiguration } =
            this.definition;
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
            dataTimezone,
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

        // Date zoom targets the source query's dimensions; it rewrites the
        // explore, not the metric query, and stays inert when a collapsed
        // totals query doesn't select the zoom dimension.
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

        this.queryBuilder = new MetricQueryBuilder({
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
            dataTimezone,
            rebaseRawTimestampFilters,
            totalConfiguration,
        });
        return this.queryBuilder;
    }

    /** The explore the query runs against. */
    getExplore(): Explore {
        return this.context.explore;
    }

    /** The effective (totals-collapsed) metric query the composer compiles. */
    getMetricQuery(): MetricQuery {
        const metricQuery = this.definition.totalConfiguration
            ? this.getQueryBuilder().getEffectiveMetricQuery()
            : this.definition.metricQuery;
        const { labelDimensionMap } = this.compile();
        if (!labelDimensionMap) {
            return metricQuery;
        }
        return {
            ...metricQuery,
            labelDimensionMap,
        };
    }

    /**
     * The effective pivot configuration with companion label dimensions folded
     * in as passthrough dimensions, so their values are carried through the
     * pivot pipeline onto each row (the pivot would otherwise drop any base
     * dimension that isn't an index/group-by/value column).
     */
    getPivotConfiguration(): PivotConfiguration | undefined {
        const pivotConfiguration = this.definition.totalConfiguration
            ? this.getQueryBuilder().getEffectivePivotConfiguration()
            : this.definition.pivotConfiguration;
        if (!pivotConfiguration) {
            return undefined;
        }
        const { companionLabelDimensionIds } = this.compile();
        if (
            !companionLabelDimensionIds ||
            companionLabelDimensionIds.length === 0
        ) {
            return pivotConfiguration;
        }
        const existingReferences = new Set<string>([
            ...normalizeIndexColumns(pivotConfiguration.indexColumn).map(
                (col) => col.reference,
            ),
            ...(pivotConfiguration.groupByColumns ?? []).map(
                (col) => col.reference,
            ),
            ...(pivotConfiguration.sortOnlyDimensions ?? []).map(
                (col) => col.reference,
            ),
            ...(pivotConfiguration.passthroughDimensions ?? []).map(
                (col) => col.reference,
            ),
        ]);
        const labelPassthroughs = companionLabelDimensionIds
            .filter((reference) => !existingReferences.has(reference))
            .map((reference) => ({ reference }));
        if (labelPassthroughs.length === 0) {
            return pivotConfiguration;
        }
        return {
            ...pivotConfiguration,
            passthroughDimensions: [
                ...(pivotConfiguration.passthroughDimensions ?? []),
                ...labelPassthroughs,
            ],
        };
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
        const queryBuilder = this.getQueryBuilder();
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
        const pivotConfiguration = this.getPivotConfiguration();

        if (!pivotConfiguration) {
            return compiledQuery.query;
        }

        const pivotQueryBuilder = new PivotQueryBuilder(
            compiledQuery.query,
            pivotConfiguration,
            this.context.warehouseSqlBuilder,
            this.getMetricQuery().limit,
            this.context.pivotItemsMap ?? compiledQuery.fields,
        );
        return pivotQueryBuilder.toSql({ columnLimit });
    }
}
