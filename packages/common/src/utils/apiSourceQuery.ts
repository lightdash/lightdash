import {
    type ApiSourceCapabilities,
    type ApiSourceExplore,
    type ApiSourceFieldRule,
    type ApiSourcePushdown,
} from '../types/apiSourceExplore';
import { type FieldId } from '../types/field';
import {
    FilterOperator,
    flattenFilterGroup,
    isAndFilterGroup,
    isFilterGroup,
    isFilterRule,
    UnitOfTime,
    type FilterGroup,
    type FilterRule,
} from '../types/filter';
import { type LiveSourceRefusalCode } from '../types/liveSourceErrors';
import {
    isPeriodOverPeriodAdditionalMetric,
    type MetricQuery,
} from '../types/metricQuery';
import { ApiConnectorType } from '../types/querySources';
import assertUnreachable from './assertUnreachable';

/** Why a metric query can't run on a live data source explore, with what to change. */
export type ApiSourceQueryIssue = {
    code: LiveSourceRefusalCode;
    fieldId: FieldId | null;
    message: string;
};

/** What the query asks for beyond its metric query. */
export type ApiSourceQueryContext = {
    isPivoted?: boolean;
    /** The date zoom granularity, e.g. `Week`; absent without date zoom. */
    dateZoomGranularity?: string;
};

const getFieldRule = (
    apiSource: ApiSourceExplore,
    fieldId: FieldId,
): ApiSourceFieldRule | undefined =>
    Object.hasOwn(apiSource.fields, fieldId)
        ? apiSource.fields[fieldId]
        : undefined;

const INTEGRATION_LABELS: Record<ApiConnectorType, string> = {
    [ApiConnectorType.GA4]: 'Google Analytics',
    [ApiConnectorType.SEARCH_CONSOLE]: 'Search Console',
    [ApiConnectorType.POSTHOG]: 'PostHog',
};

const ALL_REFUSED: ApiSourceCapabilities['pushdown'] = {
    tableCalculations: 'refused',
    customDimensions: 'refused',
    customMetrics: 'refused',
    pivots: 'refused',
    periodOverPeriod: 'refused',
    dateZoom: 'refused',
};

/**
 * The capabilities of explores built before connectors declared them, read
 * from their field rules: they refuse exactly what they refused then.
 */
const getLegacyCapabilities = (
    apiSource: ApiSourceExplore,
): ApiSourceCapabilities => {
    const { integration, dateRange, filterGroups } = apiSource;
    const isReportApi = (): boolean => {
        switch (integration) {
            case ApiConnectorType.GA4:
            case ApiConnectorType.SEARCH_CONSOLE:
                return true;
            case ApiConnectorType.POSTHOG:
                return false;
            default:
                return assertUnreachable(integration, 'Unknown api connector');
        }
    };
    const dateRule = dateRange
        ? getFieldRule(apiSource, dateRange.fieldId)
        : undefined;
    return {
        // Field rules carry each field's operators, so none are needed here
        filters: {
            operators: {},
            multipleValues: integration !== ApiConnectorType.SEARCH_CONSOLE,
            or: filterGroups.or,
            nestedGroups: filterGroups.nested,
        },
        metricFilters: true,
        dates: {
            rangeRequired: isReportApi(),
            operators: dateRule?.filterOperators ?? [],
            grains: [],
            timezone: isReportApi() ? 'fixed' : 'configurable',
        },
        pushdown: ALL_REFUSED,
        metrics: {},
    };
};

/** What the explore's connector can do; explores built before capabilities get today's refusals. */
export const getApiSourceCapabilities = (
    apiSource: ApiSourceExplore,
): ApiSourceCapabilities =>
    apiSource.capabilities ?? getLegacyCapabilities(apiSource);

/** Whether a live data source runs `feature`; only `native` runs today. */
export const isApiSourcePushdownSupported = (
    pushdown: ApiSourcePushdown,
): boolean => pushdown === 'native';

const getFilterFieldIds = (metricQuery: MetricQuery): FieldId[] =>
    [metricQuery.filters.dimensions, metricQuery.filters.metrics].flatMap(
        (group) =>
            group
                ? flattenFilterGroup(group).map((rule) => rule.target.fieldId)
                : [],
    );

const getUnsupportedFeatureIssues = (
    { pushdown, dates }: ApiSourceCapabilities,
    metricQuery: MetricQuery,
    context: ApiSourceQueryContext,
): ApiSourceQueryIssue[] => {
    const tableCalculationFilters = metricQuery.filters.tableCalculations
        ? flattenFilterGroup(metricQuery.filters.tableCalculations)
        : [];
    // Period-over-period comparisons arrive as generated custom metrics
    const additionalMetrics = metricQuery.additionalMetrics ?? [];
    const periodOverPeriodMetrics = additionalMetrics.filter(
        isPeriodOverPeriodAdditionalMetric,
    );
    const customMetrics = additionalMetrics.filter(
        (metric) => !isPeriodOverPeriodAdditionalMetric(metric),
    );
    const isRefused = (feature: ApiSourcePushdown) =>
        !isApiSourcePushdownSupported(feature);
    const toFeatureMessage = (name: string) =>
        `${name} can't run on live data sources yet. Remove them from the query.`;
    const features = [
        {
            isUsed:
                metricQuery.tableCalculations.length > 0 &&
                isRefused(pushdown.tableCalculations),
            code: 'live_source.refused.table_calculation' as const,
            message: toFeatureMessage('Table calculations'),
        },
        {
            isUsed:
                tableCalculationFilters.length > 0 &&
                isRefused(pushdown.tableCalculations),
            code: 'live_source.refused.table_calculation' as const,
            message: toFeatureMessage('Table calculation filters'),
        },
        {
            isUsed:
                customMetrics.length > 0 && isRefused(pushdown.customMetrics),
            code: 'live_source.refused.custom_metric' as const,
            message: toFeatureMessage('Custom metrics'),
        },
        {
            isUsed:
                periodOverPeriodMetrics.length > 0 &&
                isRefused(pushdown.periodOverPeriod),
            code: 'live_source.refused.period_over_period' as const,
            message: toFeatureMessage('Period-over-period comparisons'),
        },
        {
            isUsed:
                (metricQuery.customDimensions ?? []).length > 0 &&
                isRefused(pushdown.customDimensions),
            code: 'live_source.refused.custom_dimension' as const,
            message: toFeatureMessage('Custom dimensions'),
        },
        {
            isUsed: !!context.isPivoted && isRefused(pushdown.pivots),
            code: 'live_source.refused.pivot' as const,
            message:
                "Pivoted results aren't available from live data sources yet. Remove the pivot to run this query.",
        },
        {
            isUsed: !!metricQuery.timezone && dates.timezone === 'fixed',
            code: 'live_source.refused.timezone' as const,
            message:
                'This live data source reports dates in its own time zone. Remove the time zone override to run this query.',
        },
        {
            isUsed:
                !!context.dateZoomGranularity && isRefused(pushdown.dateZoom),
            code: 'live_source.refused.date_zoom' as const,
            message: "Date zoom isn't available on live data sources yet.",
        },
    ];
    return features
        .filter(({ isUsed }) => isUsed)
        .map(({ code, message }) => ({ code, fieldId: null, message }));
};

const getUnknownFieldIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => {
    const fieldIds = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.sorts.map((sort) => sort.fieldId),
        ...getFilterFieldIds(metricQuery),
    ]);
    return [...fieldIds]
        .filter((fieldId) => !getFieldRule(apiSource, fieldId))
        .map((fieldId) => ({
            code: 'live_source.refused.unknown_field',
            fieldId,
            message: `"${fieldId}" isn't available from this live data source.`,
        }));
};

const getFilterGroupShape = (
    group: FilterGroup,
    depth = 0,
): { usesOr: boolean; isNested: boolean } => {
    const items = (isAndFilterGroup(group) ? group.and : group.or) ?? [];
    const childShapes = items
        .filter(isFilterGroup)
        .map((child) => getFilterGroupShape(child, depth + 1));
    return {
        usesOr:
            (!isAndFilterGroup(group) && items.length > 1) ||
            childShapes.some((shape) => shape.usesOr),
        isNested: depth > 0 || childShapes.some((shape) => shape.isNested),
    };
};

// One filter matching several of these values is an OR of matches
const POSITIVE_MATCH_OPERATORS = [
    FilterOperator.EQUALS,
    FilterOperator.INCLUDE,
];
const RELATIVE_DATE_OPERATORS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
];

const SUB_DAY_UNITS = [
    UnitOfTime.milliseconds,
    UnitOfTime.seconds,
    UnitOfTime.minutes,
    UnitOfTime.hours,
];

const getFilterIssues = (
    apiSource: ApiSourceExplore,
    capabilities: ApiSourceCapabilities,
    group: FilterGroup | undefined,
    kind: 'dimensions' | 'metrics',
): ApiSourceQueryIssue[] => {
    if (!group) {
        return [];
    }
    const { filters } = capabilities;
    const shape = getFilterGroupShape(group);
    const shapeIssues = [
        ...(shape.usesOr && !filters.or
            ? [
                  {
                      code: 'live_source.refused.or_group' as const,
                      fieldId: null,
                      message:
                          'This live data source only combines filters with AND. Replace the OR group with separate queries.',
                  },
              ]
            : []),
        ...(shape.isNested && !filters.nestedGroups
            ? [
                  {
                      code: 'live_source.refused.nested_group' as const,
                      fieldId: null,
                      message:
                          "This live data source can't nest filter groups. Put every filter in one group.",
                  },
              ]
            : []),
    ];
    const ruleIssues = flattenFilterGroup(group)
        .filter((rule) => !rule.disabled)
        .flatMap((rule): ApiSourceQueryIssue[] => {
            const { fieldId } = rule.target;
            const fieldRule = getFieldRule(apiSource, fieldId);
            if (!fieldRule) {
                return [];
            }
            const isMetricFilterRefused =
                kind === 'metrics' && !capabilities.metricFilters;
            const operators = isMetricFilterRefused
                ? []
                : fieldRule.filterOperators;
            const getOperatorRefusalCode = (): LiveSourceRefusalCode => {
                if (isMetricFilterRefused) {
                    return 'live_source.refused.metric_filter';
                }
                return fieldId === apiSource.dateRange?.fieldId
                    ? 'live_source.refused.date_operator'
                    : 'live_source.refused.filter_operator';
            };
            if (!operators.includes(rule.operator)) {
                return [
                    {
                        code: getOperatorRefusalCode(),
                        fieldId,
                        message:
                            operators.length === 0
                                ? `"${fieldId}" can't be filtered on this live data source.`
                                : `"${fieldId}" can't be filtered with "${rule.operator}". Use one of: ${operators.join(', ')}.`,
                    },
                ];
            }
            // A range-required date is the API's date range, not a filter
            const isDateRange =
                capabilities.dates.rangeRequired &&
                fieldId === apiSource.dateRange?.fieldId;
            if (
                !isDateRange &&
                !filters.multipleValues &&
                POSITIVE_MATCH_OPERATORS.includes(rule.operator) &&
                (rule.values ?? []).length > 1
            ) {
                return [
                    {
                        code: 'live_source.refused.multiple_values',
                        fieldId,
                        message: `${INTEGRATION_LABELS[apiSource.integration]} matches one value per filter; filter "${fieldId}" by one value at a time.`,
                    },
                ];
            }
            return [];
        });
    return [...shapeIssues, ...ruleIssues];
};

/**
 * An API that reads the date as one range needs one date filter, ANDed with
 * the others at the top level, in days or longer.
 */
const getDateRangeIssues = (
    apiSource: ApiSourceExplore,
    capabilities: ApiSourceCapabilities,
    group: FilterGroup | undefined,
): ApiSourceQueryIssue[] => {
    const { dateRange } = apiSource;
    if (!group || !dateRange || !capabilities.dates.rangeRequired) {
        return [];
    }
    const items = (isAndFilterGroup(group) ? group.and : group.or) ?? [];
    const isTopLevelAnd = isAndFilterGroup(group) || items.length === 1;
    const isDateRule = (item: FilterGroup | FilterRule): item is FilterRule =>
        isFilterRule(item) &&
        !item.disabled &&
        item.target.fieldId === dateRange.fieldId;
    const hasNestedDateRule = (item: FilterGroup | FilterRule): boolean =>
        isFilterGroup(item) &&
        ((isAndFilterGroup(item) ? item.and : item.or) ?? []).some(
            (child) => isDateRule(child) || hasNestedDateRule(child),
        );
    const dateRules = items.filter(isDateRule);
    // Sources without OR or nesting already refuse the whole group
    const { filters } = capabilities;
    if (
        (filters.nestedGroups && items.some(hasNestedDateRule)) ||
        (filters.or && dateRules.length > 0 && !isTopLevelAnd)
    ) {
        return [
            {
                code: 'live_source.refused.date_range',
                fieldId: dateRange.fieldId,
                message:
                    'Filter the date with one filter combined with the others by AND, not inside an OR group.',
            },
        ];
    }
    if (dateRules.length > 1) {
        return [
            {
                code: 'live_source.refused.date_range',
                fieldId: dateRange.fieldId,
                message:
                    'Filter the date once: combine the date filters into one range.',
            },
        ];
    }
    return dateRules.flatMap((rule): ApiSourceQueryIssue[] => {
        const settings: unknown = rule.settings;
        const unit =
            typeof settings === 'object' &&
            settings !== null &&
            'unitOfTime' in settings
                ? settings.unitOfTime
                : undefined;
        return RELATIVE_DATE_OPERATORS.includes(rule.operator) &&
            SUB_DAY_UNITS.some((subDayUnit) => subDayUnit === unit)
            ? [
                  {
                      code: 'live_source.refused.date_operator' as const,
                      fieldId: dateRange.fieldId,
                      message: `Live data sources report by day; filter in days or longer, not ${String(unit)}.`,
                  },
              ]
            : [];
    });
};

const getIncompatibilityIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => {
    const used = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...getFilterFieldIds(metricQuery),
    ]);
    return apiSource.incompatible.flatMap((incompatibility) => {
        const field = incompatibility.fields.find((id) => used.has(id));
        const other = incompatibility.with.find((id) => used.has(id));
        if (!field || !other) {
            return [];
        }
        return [
            {
                code: 'live_source.refused.field_combination',
                fieldId: field,
                message: `"${field}" can't be combined with "${other}": ${incompatibility.reason}`,
            },
        ];
    });
};

const getSizeIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => {
    const limits = [
        {
            count: metricQuery.dimensions.length,
            max: apiSource.maxDimensions,
            noun: 'dimensions',
        },
        {
            count: metricQuery.metrics.length,
            max: apiSource.maxMetrics,
            noun: 'metrics',
        },
    ];
    return limits
        .filter(({ count, max }) => max !== null && count > max)
        .map(({ count, max, noun }) => ({
            code: 'live_source.refused.too_many_fields',
            fieldId: null,
            message: `This live data source allows at most ${max} ${noun} per query; this one has ${count}.`,
        }));
};

/** Every reason the API behind `apiSource` can't answer `metricQuery`; empty when it can. */
export const getApiSourceQueryIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
    context: ApiSourceQueryContext = {},
): ApiSourceQueryIssue[] => {
    const capabilities = getApiSourceCapabilities(apiSource);
    const { dimensions, metrics } = metricQuery.filters;
    return [
        ...getUnsupportedFeatureIssues(capabilities, metricQuery, context),
        ...getUnknownFieldIssues(apiSource, metricQuery),
        ...getFilterIssues(apiSource, capabilities, dimensions, 'dimensions'),
        ...getFilterIssues(apiSource, capabilities, metrics, 'metrics'),
        ...getDateRangeIssues(apiSource, capabilities, dimensions),
        ...getIncompatibilityIssues(apiSource, metricQuery),
        ...getSizeIssues(apiSource, metricQuery),
    ];
};
