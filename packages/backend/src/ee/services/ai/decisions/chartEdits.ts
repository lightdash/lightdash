import {
    assertUnreachable,
    filterExpressionResolvedFiltersSchema,
    FilterOperator,
    FilterType,
    getFields,
    getFilterTypeFromItemType,
    getItemId,
    getItemLabelWithoutTableName,
    isAndFilterGroup,
    isCustomChartTypeSlugChartConfig,
    isDimension,
    isFilterRule,
    parseAiArtifactChartConfig,
    type AiSemanticChartArtifactConfig,
    type Explore,
    type FilterExpressionResolvedFiltersV2,
    type ToolRunQueryBuiltinChartConfig,
} from '@lightdash/common';
import { resolveSearchFieldValuesFilterExpression } from '../utils/filterExpressions';
import type {
    ChartIntent,
    ChartPeriod,
    ChartTypeOption,
    NumberComparison,
    TextMatchMode,
} from './chartIntent';

export type ChartEdit = {
    config: AiSemanticChartArtifactConfig;
    response: string;
    changed: boolean;
};

type BuiltinChart = ToolRunQueryBuiltinChartConfig;

type PersistedRule = NonNullable<
    FilterExpressionResolvedFiltersV2['dimensions']
>['rules'][number];

/** An unvalidated rule; the filters schema parse below is the type boundary. */
type RuleInput = {
    fieldId: string;
    fieldType: string;
    fieldFilterType: FilterType;
    operator: FilterOperator;
    values: unknown[] | undefined;
    settings?: unknown;
};

const fieldMap = (explore: Explore) =>
    new Map(getFields(explore).map((field) => [getItemId(field), field]));

const labelOf = (explore: Explore, fieldId: string) => {
    const field = fieldMap(explore).get(fieldId);
    return field ? getItemLabelWithoutTableName(field) : fieldId;
};

const metricIdsOf = (artifact: AiSemanticChartArtifactConfig) => [
    ...artifact.config.queryConfig.metrics,
    ...(artifact.config.queryConfig.tableCalculations ?? []).map(
        ({ name }) => name,
    ),
];

// Rebuild the portable snapshot on export after any change.
const reparse = (
    artifact: AiSemanticChartArtifactConfig,
    config: object,
): AiSemanticChartArtifactConfig | null => {
    const { contentAsCode: _contentAsCode, ...current } = artifact;
    const parsed = parseAiArtifactChartConfig({ ...current, config });
    return parsed?.source === 'semantic' ? parsed : null;
};

const normalizePersistedFilters = (
    raw: unknown,
): FilterExpressionResolvedFiltersV2 | null => {
    if (raw === null || raw === undefined) {
        return { dimensions: null, metrics: null, tableCalculations: null };
    }
    const parsed = filterExpressionResolvedFiltersSchema.safeParse(raw);
    if (!parsed.success) return null;
    const filters = parsed.data;
    if (!('type' in filters)) return filters;
    const group = <T>(rules: T[] | null) =>
        rules?.length ? { connector: filters.type, rules } : null;
    return {
        dimensions: group(filters.dimensions),
        metrics: group(filters.metrics),
        tableCalculations: group(filters.tableCalculations),
    };
};

const formatFilterField = (fieldId: string): string =>
    /^[A-Za-z0-9_.-]+$/.test(fieldId) &&
    !['and', 'or'].includes(fieldId.toLowerCase())
        ? fieldId
        : `\`${fieldId.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** First day of a named calendar year, quarter or month and first day after it (UTC). */
export const calendarRange = (
    period: Extract<ChartPeriod, { type: 'calendar' }>,
): [string, string] => {
    let firstMonth = 0;
    let months = 12;
    if (period.quarter !== null) {
        firstMonth = (period.quarter - 1) * 3;
        months = 3;
    } else if (period.month !== null) {
        firstMonth = period.month - 1;
        months = 1;
    }
    const start = new Date(Date.UTC(period.year, firstMonth, 1));
    const next = new Date(Date.UTC(period.year, firstMonth + months, 1));
    return [isoDate(start), isoDate(next)];
};

const periodConditions = (period: ChartPeriod): string[] => {
    switch (period.type) {
        case 'last':
            return [
                `${FilterOperator.IN_THE_PAST}=${period.count}{unit:${period.unit},completed:false}`,
            ];
        case 'previous':
            return [
                `${FilterOperator.IN_THE_PAST}=1{unit:${period.unit},completed:true}`,
            ];
        case 'current':
            return [`${FilterOperator.IN_THE_CURRENT}=${period.unit}`];
        case 'calendar': {
            // An exclusive end keeps the whole last day on timestamp fields.
            const [start, next] = calendarRange(period);
            return [
                `${FilterOperator.GREATER_THAN_OR_EQUAL}=${start}`,
                `${FilterOperator.LESS_THAN}=${next}`,
            ];
        }
        case 'range':
            return [
                ...(period.start
                    ? [
                          `${FilterOperator.GREATER_THAN_OR_EQUAL}=${period.start}`,
                      ]
                    : []),
                ...(period.end
                    ? [`${FilterOperator.LESS_THAN}=${period.end}`]
                    : []),
            ];
        default:
            return assertUnreachable(period, 'Unknown chart period');
    }
};

const periodRules = (
    intent: Extract<ChartIntent, { kind: 'filter_period' }>,
    explore: Explore,
): RuleInput[] | null => {
    const field = formatFilterField(intent.fieldId);
    const conditions = periodConditions(intent.period);
    const resolved = resolveSearchFieldValuesFilterExpression({
        expressionInput: conditions
            .map((condition) => `${field} ${condition}`)
            .join(' AND '),
        explore,
    });
    if (!resolved.success) return null;
    const group = resolved.data.dimensions;
    if (
        !group ||
        !isAndFilterGroup(group) ||
        group.and.length !== conditions.length
    )
        return null;
    const exploreFields = fieldMap(explore);
    const rules = group.and.flatMap((rule) => {
        if (!isFilterRule(rule) || !('fieldId' in rule.target)) return [];
        const target = exploreFields.get(rule.target.fieldId);
        if (!target) return [];
        return [
            {
                fieldId: rule.target.fieldId,
                fieldType: target.type,
                fieldFilterType: getFilterTypeFromItemType(target.type),
                operator: rule.operator,
                values: rule.values,
                ...(rule.settings ? { settings: rule.settings } : {}),
            },
        ];
    });
    return rules.length === conditions.length ? rules : null;
};

const valueRules = (
    intent: Extract<ChartIntent, { kind: 'filter_values' }>,
    explore: Explore,
    existing: PersistedRule[],
): RuleInput[] | null => {
    const field = fieldMap(explore).get(intent.fieldId);
    if (!field || intent.values.length === 0) return null;
    const operator = intent.exclude
        ? FilterOperator.NOT_EQUALS
        : FilterOperator.EQUALS;
    // Exclusions accumulate so "exclude A" then "exclude B" keeps both out.
    const previous = intent.exclude
        ? existing.flatMap((rule) =>
              rule.fieldId === intent.fieldId &&
              rule.operator === FilterOperator.NOT_EQUALS
                  ? (rule.values ?? []).filter(
                        (value): value is string => typeof value === 'string',
                    )
                  : [],
          )
        : [];
    return [
        {
            fieldId: intent.fieldId,
            fieldType: field.type,
            fieldFilterType: getFilterTypeFromItemType(field.type),
            operator,
            values: [...new Set([...previous, ...intent.values])],
        },
    ];
};

const describeValueFilter = (
    intent: Extract<ChartIntent, { kind: 'filter_values' }>,
) => {
    const values = intent.values.map((value) => `**${value}**`).join(', ');
    return intent.exclude ? `Excluded ${values}.` : `Filtered to ${values}.`;
};

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

const formatDay = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
};

/** The exclusive end is shown as the last day it keeps. */
const describeRange = ({
    start,
    end,
}: Extract<ChartPeriod, { type: 'range' }>): string => {
    const lastDay = end
        ? formatDay(
              new Date(Date.parse(`${end}T00:00:00Z`) - 86_400_000)
                  .toISOString()
                  .slice(0, 10),
          )
        : null;
    if (start && lastDay) return `${formatDay(start)} to ${lastDay}`;
    if (start) return `dates from ${formatDay(start)}`;
    return `dates up to ${lastDay ?? ''}`;
};

const describePeriod = ({
    period,
}: Extract<ChartIntent, { kind: 'filter_period' }>): string => {
    switch (period.type) {
        case 'last':
            return `Filtered to the last ${period.count} ${period.unit}.`;
        case 'previous':
            return `Filtered to last ${period.unit.replace(/s$/, '')}.`;
        case 'current':
            return `Filtered to this ${period.unit.replace(/s$/, '')}.`;
        case 'calendar':
            if (period.quarter !== null)
                return `Filtered to Q${period.quarter} ${period.year}.`;
            if (period.month !== null)
                return `Filtered to ${MONTH_NAMES[period.month - 1]} ${period.year}.`;
            return `Filtered to ${period.year}.`;
        case 'range':
            return `Filtered to ${describeRange(period)}.`;
        default:
            return assertUnreachable(period, 'Unknown chart period');
    }
};

/** Time-interval variants of one date share a base, so a new period replaces them all. */
const dateBaseOf = (explore: Explore, fieldId: string): string => {
    const field = fieldMap(explore).get(fieldId);
    if (!field || !isDimension(field)) return fieldId;
    return `${field.table}.${field.timeIntervalBaseDimensionName ?? field.name}`;
};

const applyFilter = (
    intent: Extract<
        ChartIntent,
        | { kind: 'filter_values' }
        | { kind: 'filter_period' }
        | { kind: 'clear_filters' }
    >,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    const current = normalizePersistedFilters(
        artifact.config.queryConfig.filters,
    );
    if (!current) return null;
    let next: FilterExpressionResolvedFiltersV2 | null = null;
    let response = 'Cleared the chart filters.';
    if (intent.kind !== 'clear_filters') {
        const target = fieldMap(explore).get(intent.fieldId);
        if (!target || !isDimension(target)) return null;
        const existing = current.dimensions;
        if (existing && existing.connector !== 'and') return null;
        const rules =
            intent.kind === 'filter_period'
                ? periodRules(intent, explore)
                : valueRules(intent, explore, existing?.rules ?? []);
        if (!rules) return null;
        const isReplaced = ({ fieldId }: PersistedRule) =>
            intent.kind === 'filter_period'
                ? dateBaseOf(explore, fieldId) ===
                  dateBaseOf(explore, intent.fieldId)
                : fieldId === intent.fieldId;
        const parsed = filterExpressionResolvedFiltersSchema.safeParse({
            ...current,
            dimensions: {
                connector: 'and',
                rules: [
                    ...(existing?.rules ?? []).filter(
                        (rule) => !isReplaced(rule),
                    ),
                    ...rules,
                ],
            },
        });
        if (!parsed.success || 'type' in parsed.data) return null;
        next = parsed.data;
        response =
            intent.kind === 'filter_period'
                ? describePeriod(intent)
                : describeValueFilter(intent);
    }
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: { ...artifact.config.queryConfig, filters: next },
    });
    if (!config) return null;
    const changed =
        JSON.stringify(config.config.queryConfig.filters) !==
        JSON.stringify(artifact.config.queryConfig.filters);
    return {
        config,
        response: changed ? response : 'The chart already uses that filter.',
        changed,
    };
};

const applyRemoveFilter = (
    intent: Extract<ChartIntent, { kind: 'remove_filter' }>,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    const current = normalizePersistedFilters(
        artifact.config.queryConfig.filters,
    );
    if (!current) return null;
    const groups = [current.dimensions, current.metrics];
    const holding = groups.filter((group) =>
        group?.rules.some(({ fieldId }) => fieldId === intent.fieldId),
    );
    // Dropping one branch of an OR group changes its meaning, so the agent handles it.
    if (
        holding.length === 0 ||
        holding.some((group) => group?.connector !== 'and')
    )
        return null;
    const without = (group: (typeof groups)[number]) => {
        const rules =
            group?.rules.filter(({ fieldId }) => fieldId !== intent.fieldId) ??
            [];
        return group && rules.length > 0 ? { ...group, rules } : null;
    };
    const remaining = {
        ...current,
        dimensions: without(current.dimensions),
        metrics: without(current.metrics),
    };
    let next: FilterExpressionResolvedFiltersV2 | null = null;
    if (
        remaining.dimensions ||
        remaining.metrics ||
        remaining.tableCalculations
    ) {
        const parsed =
            filterExpressionResolvedFiltersSchema.safeParse(remaining);
        if (!parsed.success || 'type' in parsed.data) return null;
        next = parsed.data;
    }
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: { ...artifact.config.queryConfig, filters: next },
    });
    if (!config) return null;
    return {
        config,
        response: `Removed the **${labelOf(explore, intent.fieldId)}** filter.`,
        changed: true,
    };
};

const applySort = (
    intent: Extract<ChartIntent, { kind: 'sort' } | { kind: 'clear_sort' }>,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    const query = artifact.config.queryConfig;
    if (intent.kind === 'clear_sort') {
        const config = reparse(artifact, {
            ...artifact.config,
            queryConfig: { ...query, sorts: [] },
        });
        if (!config) return null;
        const changed = query.sorts.length > 0;
        return {
            config,
            response: changed ? 'Cleared the chart sort.' : 'No sort to clear.',
            changed,
        };
    }
    const chart = artifact.config.chartConfig;
    const chartMetrics =
        chart && !isCustomChartTypeSlugChartConfig(chart)
            ? (chart.yAxisMetrics ?? [])
            : [];
    const implied = chartMetrics.length ? chartMetrics : query.metrics;
    const fieldId =
        intent.fieldId ?? (implied.length === 1 ? implied[0] : null);
    if (
        !fieldId ||
        ![...query.dimensions, ...metricIdsOf(artifact)].includes(fieldId)
    )
        return null;
    const limit = intent.limit ?? query.limit;
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: {
            ...query,
            sorts: [
                { fieldId, descending: intent.descending, nullsFirst: null },
            ],
            limit,
        },
    });
    if (!config) return null;
    const changed =
        JSON.stringify(config.config.queryConfig.sorts) !==
            JSON.stringify(query.sorts) ||
        config.config.queryConfig.limit !== query.limit;
    return {
        config,
        response: changed
            ? `Sorted by **${labelOf(explore, fieldId)}**, ${intent.descending ? 'highest' : 'lowest'} first${intent.limit ? `; showing ${intent.limit}` : ''}.`
            : 'The chart already uses that sort.',
        changed,
    };
};

const defaultChart = (metricIds: string[]): BuiltinChart => ({
    defaultVizType: 'table',
    xAxisDimension: null,
    yAxisMetrics: metricIds,
    groupBy: null,
    xAxisType: null,
    stackBars: null,
    lineType: null,
    xAxisLabel: '',
    yAxisLabel: '',
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
});

const isDateField = (explore: Explore, fieldId: string) => {
    const field = fieldMap(explore).get(fieldId);
    return Boolean(
        field &&
        isDimension(field) &&
        getFilterTypeFromItemType(field.type) === FilterType.DATE,
    );
};

const presentationTarget = (
    chart: BuiltinChart,
    chartType: ChartTypeOption,
): Partial<BuiltinChart> => {
    if (chartType === 'area')
        return { defaultVizType: 'line', lineType: 'area', stackBars: null };
    return {
        defaultVizType: chartType,
        lineType: chartType === 'line' ? 'line' : null,
        stackBars:
            chartType === 'bar' || chartType === 'horizontal'
                ? chart.stackBars
                : null,
    };
};

const applyPresentation = (
    intent: Extract<ChartIntent, { kind: 'chart_type' } | { kind: 'series' }>,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore | null,
): ChartEdit | null => {
    const chart = artifact.config.chartConfig;
    if (!chart || isCustomChartTypeSlugChartConfig(chart)) return null;
    const { dimensions } = artifact.config.queryConfig;
    const metricIds = metricIdsOf(artifact);
    const plottable =
        chart.xAxisDimension !== null &&
        dimensions.includes(chart.xAxisDimension) &&
        (chart.yAxisMetrics?.length ?? 0) > 0 &&
        (chart.yAxisMetrics ?? []).every((id) => metricIds.includes(id));
    let next: BuiltinChart;
    if (intent.kind === 'chart_type') {
        if (intent.chartType !== 'table' && !plottable) return null;
        next = { ...chart, ...presentationTarget(chart, intent.chartType) };
    } else if (intent.op === 'swap') {
        if (
            chart.defaultVizType !== 'bar' &&
            chart.defaultVizType !== 'horizontal'
        )
            return null;
        next = {
            ...chart,
            defaultVizType:
                chart.defaultVizType === 'bar' ? 'horizontal' : 'bar',
        };
    } else if (intent.op === 'stack' || intent.op === 'unstack') {
        if (
            !['bar', 'horizontal'].includes(chart.defaultVizType) ||
            !chart.groupBy?.length
        )
            return null;
        next = { ...chart, stackBars: intent.op === 'stack' };
    } else {
        const series = dimensions.filter((id) => id !== chart.xAxisDimension);
        if (
            !plottable ||
            series.length === 0 ||
            !['bar', 'horizontal', 'line', 'scatter'].includes(
                chart.defaultVizType,
            )
        )
            return null;
        next = { ...chart, groupBy: series };
    }
    if (JSON.stringify(next) === JSON.stringify(chart))
        return {
            config: artifact,
            response: 'The chart already looks like that.',
            changed: false,
        };
    const config = reparse(artifact, { ...artifact.config, chartConfig: next });
    if (!config) return null;
    const seriesLabels =
        intent.kind === 'series' && intent.op === 'split' && explore
            ? (next.groupBy ?? []).map((id) => `**${labelOf(explore, id)}**`)
            : [];
    return {
        config,
        changed: true,
        response: seriesLabels.length
            ? `Split the series by ${seriesLabels.join(' and ')}.`
            : 'Updated the chart.',
    };
};

const applyAddField = (
    intent: Extract<ChartIntent, { kind: 'add_field' }>,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    const field = fieldMap(explore).get(intent.fieldId);
    const currentChart = artifact.config.chartConfig;
    if (
        !field ||
        !isDimension(field) ||
        isCustomChartTypeSlugChartConfig(currentChart)
    )
        return null;
    const query = artifact.config.queryConfig;
    const metricIds = metricIdsOf(artifact);
    if (metricIds.length === 0) return null;
    const chart = currentChart ?? defaultChart(metricIds);
    const currentAxis =
        chart.xAxisDimension && query.dimensions.includes(chart.xAxisDimension)
            ? chart.xAxisDimension
            : null;
    // The new field becomes the axis when there is none yet, when charting a table, or
    // when it is a date on a non-date axis ("per month"); prior dimensions then group the series.
    const promote =
        currentAxis === null ||
        (chart.defaultVizType === 'table' &&
            intent.chartType !== null &&
            intent.chartType !== 'table') ||
        (isDateField(explore, intent.fieldId) &&
            !isDateField(explore, currentAxis));
    const xAxisDimension = promote ? intent.fieldId : currentAxis;
    const groupBy = [...query.dimensions, intent.fieldId].filter(
        (id, index, ids) => id !== xAxisDimension && ids.indexOf(id) === index,
    );
    const dimensions = [xAxisDimension, ...groupBy];
    const kept = new Set([...dimensions, ...metricIds]);
    const yAxisMetrics = (chart.yAxisMetrics ?? []).filter((id) =>
        metricIds.includes(id),
    );
    const promotedAxisType = isDateField(explore, intent.fieldId)
        ? 'time'
        : 'category';
    const next: BuiltinChart = {
        ...chart,
        xAxisDimension,
        yAxisMetrics: yAxisMetrics.length ? yAxisMetrics : metricIds,
        groupBy: groupBy.length ? groupBy : null,
        xAxisType: promote ? promotedAxisType : chart.xAxisType,
        xAxisLabel: promote
            ? getItemLabelWithoutTableName(field)
            : chart.xAxisLabel,
    };
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: {
            ...query,
            exploreName: explore.name,
            dimensions,
            sorts: query.sorts.filter(({ fieldId }) => kept.has(fieldId)),
        },
        chartConfig: next,
    });
    if (!config) return null;
    const label = getItemLabelWithoutTableName(field);
    const exploreNote =
        explore.name !== query.exploreName ? ` from **${explore.label}**` : '';
    const added: ChartEdit = {
        config,
        response: `Added **${label}**${exploreNote}.`,
        changed: true,
    };
    if (!intent.chartType) return added;
    const presented = applyPresentation(
        { kind: 'chart_type', chartType: intent.chartType },
        config,
        explore,
    );
    return presented
        ? {
              ...presented,
              changed: true,
              response: `Added **${label}**${exploreNote} and updated the chart.`,
          }
        : null;
};

const replaceId = (ids: string[], from: string, to: string) =>
    ids.map((id) => (id === from ? to : id));

/** Removes `outgoing`, adds `incoming`, or swaps one for the other in place. */
const editIds = (
    ids: string[],
    outgoing: string | null,
    incoming: string | null,
): string[] => {
    if (outgoing === null) return incoming ? [...ids, incoming] : ids;
    if (incoming === null) return ids.filter((id) => id !== outgoing);
    return replaceId(ids, outgoing, incoming);
};

type FieldChange = { outgoing: string | null; incoming: string | null };

const metricChange = (
    intent: Extract<
        ChartIntent,
        | { kind: 'add_metric' }
        | { kind: 'remove_metric' }
        | { kind: 'swap_metric' }
    >,
): FieldChange => {
    switch (intent.kind) {
        case 'add_metric':
            return { outgoing: null, incoming: intent.fieldId };
        case 'remove_metric':
            return { outgoing: intent.fieldId, incoming: null };
        case 'swap_metric':
            return { outgoing: intent.fromFieldId, incoming: intent.toFieldId };
        default:
            return assertUnreachable(intent, 'Unknown metric edit');
    }
};

const describeChange = (
    explore: Explore,
    { outgoing, incoming }: FieldChange,
    noun: string,
): string => {
    if (outgoing && incoming)
        return `Showing **${labelOf(explore, incoming)}** instead of **${labelOf(explore, outgoing)}**.`;
    if (outgoing)
        return `Removed the **${labelOf(explore, outgoing)}** ${noun}.`;
    return `Added **${labelOf(explore, incoming ?? '')}**.`;
};

/** Metric filters name metrics directly, so dropping or swapping a filtered metric is left to the agent. */
const filtersMetric = (
    artifact: AiSemanticChartArtifactConfig,
    fieldId: string,
): boolean => {
    const filters = normalizePersistedFilters(
        artifact.config.queryConfig.filters,
    );
    return (
        filters === null ||
        (filters.metrics?.rules ?? []).some((rule) => rule.fieldId === fieldId)
    );
};

const applyMetricEdit = (
    intent: Parameters<typeof metricChange>[0],
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    const query = artifact.config.queryConfig;
    const currentChart = artifact.config.chartConfig;
    if (isCustomChartTypeSlugChartConfig(currentChart)) return null;
    const change = metricChange(intent);
    const { incoming, outgoing } = change;
    if (incoming !== null) {
        const field = fieldMap(explore).get(incoming);
        if (!field || isDimension(field) || query.metrics.includes(incoming))
            return null;
    }
    if (
        outgoing !== null &&
        (!query.metrics.includes(outgoing) ||
            filtersMetric(artifact, outgoing) ||
            (incoming === null && query.metrics.length < 2))
    )
        return null;
    const metrics = editIds(query.metrics, outgoing, incoming);
    const sorts = query.sorts.flatMap((sort) => {
        if (sort.fieldId !== outgoing) return [sort];
        return incoming ? [{ ...sort, fieldId: incoming }] : [];
    });
    let chartConfig = currentChart;
    if (currentChart) {
        const yAxisMetrics = editIds(
            currentChart.yAxisMetrics ?? [],
            outgoing,
            incoming,
        );
        const secondaryGone =
            outgoing !== null && currentChart.secondaryYAxisMetric === outgoing;
        chartConfig = {
            ...currentChart,
            yAxisMetrics: yAxisMetrics.length ? yAxisMetrics : metrics,
            secondaryYAxisMetric: secondaryGone
                ? incoming
                : currentChart.secondaryYAxisMetric,
            secondaryYAxisLabel:
                secondaryGone && incoming === null
                    ? null
                    : currentChart.secondaryYAxisLabel,
            yAxisLabel: outgoing === null ? '' : currentChart.yAxisLabel,
        };
    }
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: { ...query, metrics, sorts },
        chartConfig,
    });
    if (!config) return null;
    return {
        config,
        response: describeChange(explore, change, 'metric'),
        changed: true,
    };
};

const axisTypeOf = (explore: Explore, fieldId: string) =>
    isDateField(explore, fieldId) ? 'time' : 'category';

const applyDimensionEdit = (
    intent: Extract<
        ChartIntent,
        | { kind: 'remove_field' }
        | { kind: 'swap_field' }
        | { kind: 'change_grain' }
    >,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    const query = artifact.config.queryConfig;
    const currentChart = artifact.config.chartConfig;
    if (isCustomChartTypeSlugChartConfig(currentChart)) return null;
    const change: FieldChange =
        intent.kind === 'remove_field'
            ? { outgoing: intent.fieldId, incoming: null }
            : { outgoing: intent.fromFieldId, incoming: intent.toFieldId };
    const { incoming } = change;
    const from =
        intent.kind === 'remove_field' ? intent.fieldId : intent.fromFieldId;
    if (!query.dimensions.includes(from)) return null;
    if (incoming !== null) {
        const field = fieldMap(explore).get(incoming);
        if (
            !field ||
            !isDimension(field) ||
            query.dimensions.includes(incoming)
        )
            return null;
    }
    const dimensions = editIds(query.dimensions, from, incoming);
    if (dimensions.length === 0) return null;
    const sorts = query.sorts.flatMap((sort) => {
        if (sort.fieldId !== from) return [sort];
        return incoming ? [{ ...sort, fieldId: incoming }] : [];
    });
    let chartConfig = currentChart;
    if (currentChart) {
        const axis = currentChart.xAxisDimension;
        let groupBy = editIds(currentChart.groupBy ?? [], from, incoming);
        let xAxisDimension = axis;
        if (axis === from && incoming) xAxisDimension = incoming;
        if (axis === from && !incoming) {
            [xAxisDimension = null] = groupBy.length ? groupBy : dimensions;
            groupBy = groupBy.filter((id) => id !== xAxisDimension);
        }
        const newAxis = xAxisDimension !== axis ? xAxisDimension : null;
        chartConfig = {
            ...currentChart,
            xAxisDimension,
            groupBy: groupBy.length ? groupBy : null,
            xAxisType: newAxis
                ? axisTypeOf(explore, newAxis)
                : currentChart.xAxisType,
            xAxisLabel: newAxis
                ? labelOf(explore, newAxis)
                : currentChart.xAxisLabel,
        };
    }
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: { ...query, dimensions, sorts },
        chartConfig,
    });
    if (!config) return null;
    return {
        config,
        response: describeChange(explore, change, 'breakdown'),
        changed: true,
    };
};

const COMPARISON_OPERATORS: Record<NumberComparison, FilterOperator> = {
    gt: FilterOperator.GREATER_THAN,
    gte: FilterOperator.GREATER_THAN_OR_EQUAL,
    lt: FilterOperator.LESS_THAN,
    lte: FilterOperator.LESS_THAN_OR_EQUAL,
    between: FilterOperator.IN_BETWEEN,
};

const COMPARISON_WORDS: Record<NumberComparison, string> = {
    gt: 'above',
    gte: 'at least',
    lt: 'below',
    lte: 'at most',
    between: 'between',
};

/** Threshold on a numeric dimension (row filter) or a chart metric (group filter). */
const applyNumberFilter = (
    intent: Extract<ChartIntent, { kind: 'filter_number' }>,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    const field = fieldMap(explore).get(intent.fieldId);
    const current = normalizePersistedFilters(
        artifact.config.queryConfig.filters,
    );
    if (!field || !current) return null;
    const onMetric = !isDimension(field);
    if (
        onMetric &&
        !artifact.config.queryConfig.metrics.includes(intent.fieldId)
    )
        return null;
    if (
        !onMetric &&
        getFilterTypeFromItemType(field.type) !== FilterType.NUMBER
    )
        return null;
    const group = onMetric ? current.metrics : current.dimensions;
    if (group && group.connector !== 'and') return null;
    const rule: RuleInput = {
        fieldId: intent.fieldId,
        fieldType: field.type,
        fieldFilterType: FilterType.NUMBER,
        operator: COMPARISON_OPERATORS[intent.comparison],
        values: intent.values,
    };
    const rules = [
        ...(group?.rules ?? []).filter(
            ({ fieldId }) => fieldId !== intent.fieldId,
        ),
        rule,
    ];
    const parsed = filterExpressionResolvedFiltersSchema.safeParse({
        ...current,
        [onMetric ? 'metrics' : 'dimensions']: { connector: 'and', rules },
    });
    if (!parsed.success || 'type' in parsed.data) return null;
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: { ...artifact.config.queryConfig, filters: parsed.data },
    });
    if (!config) return null;
    const amounts = intent.values
        .map((value) => value.toLocaleString('en-US'))
        .join(' and ');
    return {
        config,
        response: `Filtered to **${labelOf(explore, intent.fieldId)}** ${COMPARISON_WORDS[intent.comparison]} ${amounts}.`,
        changed: true,
    };
};

/** Replaces any rule on the field with one new row-level rule, keeping the other filters. */
const applyDimensionRule = (
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
    rule: Omit<RuleInput, 'fieldType' | 'fieldFilterType'>,
    accepts: (filterType: FilterType) => boolean,
    response: (label: string) => string,
): ChartEdit | null => {
    const field = fieldMap(explore).get(rule.fieldId);
    const current = normalizePersistedFilters(
        artifact.config.queryConfig.filters,
    );
    if (!field || !isDimension(field) || !current) return null;
    const filterType = getFilterTypeFromItemType(field.type);
    if (!accepts(filterType)) return null;
    const group = current.dimensions;
    if (group && group.connector !== 'and') return null;
    const parsed = filterExpressionResolvedFiltersSchema.safeParse({
        ...current,
        dimensions: {
            connector: 'and',
            rules: [
                ...(group?.rules ?? []).filter(
                    ({ fieldId }) => fieldId !== rule.fieldId,
                ),
                {
                    fieldId: rule.fieldId,
                    operator: rule.operator,
                    // Null checks carry no values; the schema rejects an explicit undefined.
                    ...(rule.values ? { values: rule.values } : {}),
                    fieldType: field.type,
                    fieldFilterType: filterType,
                },
            ],
        },
    });
    if (!parsed.success || 'type' in parsed.data) return null;
    const config = reparse(artifact, {
        ...artifact.config,
        queryConfig: { ...artifact.config.queryConfig, filters: parsed.data },
    });
    return config
        ? {
              config,
              response: response(getItemLabelWithoutTableName(field)),
              changed: true,
          }
        : null;
};

const TEXT_OPERATORS: Record<TextMatchMode, FilterOperator> = {
    contains: FilterOperator.INCLUDE,
    starts_with: FilterOperator.STARTS_WITH,
    ends_with: FilterOperator.ENDS_WITH,
};

const TEXT_WORDS: Record<TextMatchMode, string> = {
    contains: 'containing',
    starts_with: 'starting with',
    ends_with: 'ending with',
};

const applyValueShapeFilter = (
    intent: Extract<
        ChartIntent,
        | { kind: 'filter_boolean' }
        | { kind: 'filter_text' }
        | { kind: 'filter_blank' }
    >,
    artifact: AiSemanticChartArtifactConfig,
    explore: Explore,
): ChartEdit | null => {
    switch (intent.kind) {
        case 'filter_boolean':
            return applyDimensionRule(
                artifact,
                explore,
                {
                    fieldId: intent.fieldId,
                    operator: FilterOperator.EQUALS,
                    values: [intent.value],
                },
                (type) => type === FilterType.BOOLEAN,
                (label) =>
                    `Showing only rows where **${label}** is ${intent.value ? 'true' : 'false'}.`,
            );
        case 'filter_text': {
            // Only "contains" can be negated; the resolver never sends other excluded modes.
            if (intent.exclude && intent.mode !== 'contains') return null;
            const quoted = intent.values
                .map((value) => `"${value}"`)
                .join(' or ');
            return applyDimensionRule(
                artifact,
                explore,
                {
                    fieldId: intent.fieldId,
                    operator: intent.exclude
                        ? FilterOperator.NOT_INCLUDE
                        : TEXT_OPERATORS[intent.mode],
                    values: intent.values,
                },
                (type) => type === FilterType.STRING,
                (label) =>
                    intent.exclude
                        ? `Removed **${label}** values containing ${quoted}.`
                        : `Filtered to **${label}** ${TEXT_WORDS[intent.mode]} ${quoted}.`,
            );
        }
        case 'filter_blank':
            return applyDimensionRule(
                artifact,
                explore,
                {
                    fieldId: intent.fieldId,
                    operator: intent.blank
                        ? FilterOperator.NULL
                        : FilterOperator.NOT_NULL,
                    values: undefined,
                },
                () => true,
                (label) =>
                    intent.blank
                        ? `Showing only rows where **${label}** is empty.`
                        : `Removed rows where **${label}** is empty.`,
            );
        default:
            return assertUnreachable(intent, 'Unknown value filter');
    }
};

/** Pure reducer: applies one typed intent to the chart, or returns null so the full agent can take over. */
export const applyChartIntent = ({
    intent,
    artifact,
    explore,
}: {
    intent: Exclude<ChartIntent, { kind: 'undo' }>;
    artifact: AiSemanticChartArtifactConfig;
    explore: Explore;
}): ChartEdit | null => {
    switch (intent.kind) {
        case 'chart_type':
        case 'series':
            return applyPresentation(intent, artifact, explore);
        case 'add_field':
            return applyAddField(intent, artifact, explore);
        case 'filter_values':
        case 'filter_period':
        case 'clear_filters':
            return applyFilter(intent, artifact, explore);
        case 'remove_filter':
            return applyRemoveFilter(intent, artifact, explore);
        case 'filter_number':
            return applyNumberFilter(intent, artifact, explore);
        case 'filter_boolean':
        case 'filter_text':
        case 'filter_blank':
            return applyValueShapeFilter(intent, artifact, explore);
        case 'add_metric':
        case 'remove_metric':
        case 'swap_metric':
            return applyMetricEdit(intent, artifact, explore);
        case 'remove_field':
        case 'swap_field':
        case 'change_grain':
            return applyDimensionEdit(intent, artifact, explore);
        case 'sort':
        case 'clear_sort':
            return applySort(intent, artifact, explore);
        default:
            return assertUnreachable(intent, 'Unknown chart intent');
    }
};

/** Dimension and metric filter rules of the chart, or null when they cannot be read. */
export const getFilterRules = (
    artifact: AiSemanticChartArtifactConfig,
): PersistedRule[] | null => {
    const filters = normalizePersistedFilters(
        artifact.config.queryConfig.filters,
    );
    if (!filters) return null;
    return [filters.dimensions, filters.metrics].flatMap(
        (group) => group?.rules ?? [],
    );
};

/** Field ids referenced by the chart's persisted filters. */
export const getFilterFieldIds = (
    artifact: AiSemanticChartArtifactConfig,
): string[] | null => {
    const filters = normalizePersistedFilters(
        artifact.config.queryConfig.filters,
    );
    if (!filters) return null;
    return [filters.dimensions, filters.metrics, filters.tableCalculations]
        .flatMap((group) => group?.rules ?? [])
        .map(({ fieldId }) => fieldId);
};
