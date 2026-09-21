import {
    chartConfigBuiltinOnlySchema,
    getFields,
    getItemId,
    getItemLabelWithoutTableName,
    isCustomChartTypeSlugChartConfig,
    isField,
    isTimeBasedDimension,
    type Explore,
    type ItemsMap,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
} from '@lightdash/common';
import {
    confidentChoice,
    decisionProbability,
    type AiDecisionClient,
    type DecisionQuestion,
} from './AiDecisionClient';

const numericValue = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (
        typeof value !== 'string' ||
        !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value.trim())
    )
        return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const dimensionKey = (value: unknown, rowIndex: number): string => {
    if (value instanceof Date) return `date:${value.getTime()}`;
    try {
        return `${typeof value}:${JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item))}`;
    } catch {
        // Unsupported cells count separately; never understate series cardinality.
        return `opaque:${rowIndex}`;
    }
};

export const getChartResultShape = (
    query: ToolRunQueryArgsTransformed,
    explore: Explore,
    rows: Record<string, unknown>[],
    resultFields: ItemsMap = {},
) => {
    const fields: ItemsMap = {
        ...Object.fromEntries(
            getFields(explore).map((field) => [getItemId(field), field]),
        ),
        ...resultFields,
    };
    const dimensions = query.queryConfig.dimensions.map((id) => {
        const field = fields[id];
        return {
            id,
            label: field ? getItemLabelWithoutTableName(field) : id,
            temporal: isTimeBasedDimension(field),
            cardinality: new Set(
                rows.map((row, index) => dimensionKey(row[id], index)),
            ).size,
            seriesCardinality: new Set(
                rows.map((row, index) =>
                    query.queryConfig.dimensions
                        .filter((other) => other !== id)
                        .map((other) => {
                            const text = dimensionKey(row[other], index);
                            return `${text.length}:${text}`;
                        })
                        .join('|'),
                ),
            ).size,
            numeric: rows.every(
                (row) => row[id] === null || numericValue(row[id]) !== null,
            ),
        };
    });
    const metrics = [
        ...new Set([
            ...query.queryConfig.metrics,
            ...(query.queryConfig.tableCalculations ?? []).map(
                (calculation) => calculation.name,
            ),
        ]),
    ].map((id) => {
        const values = rows.map((row) => numericValue(row[id]));
        const field = fields[id];
        return {
            id,
            label: field ? getItemLabelWithoutTableName(field) : id,
            description: isField(field)
                ? field.description?.slice(0, 300)
                : null,
            format: isField(field) ? field.format : null,
            numeric:
                values.every(
                    (value, index) =>
                        value !== null || rows[index][id] === null,
                ) && values.some((value) => value !== null),
            nonNegative: values.every((value) => value === null || value >= 0),
            hasPositiveValues: values.some(
                (value) => value !== null && value > 0,
            ),
        };
    });
    return { rowCount: rows.length, dimensions, metrics };
};

const assembleChart = (
    shape: ReturnType<typeof getChartResultShape>,
    type: string,
    x: string | null,
    stack = false,
): ToolRunQueryBuiltinChartConfig | null => {
    const dimension = shape.dimensions.find((field) => field.id === x);
    const { metrics } = shape;
    const groups = shape.dimensions.filter((field) => field.id !== x);
    if (
        type !== 'table' &&
        (!dimension ||
            metrics.length === 0 ||
            metrics.some((metric) => !metric.numeric) ||
            dimension.seriesCardinality > 12 ||
            ((type === 'pie' || type === 'funnel' || type === 'scatter') &&
                (metrics.length !== 1 || groups.length > 0)))
    )
        return null;
    const axisType = dimension?.temporal ? 'time' : 'category';
    const parsed = chartConfigBuiltinOnlySchema.safeParse({
        defaultVizType: type,
        xAxisDimension: type === 'table' ? null : x,
        yAxisMetrics:
            type === 'table' ? null : metrics.map((field) => field.id),
        groupBy:
            type === 'table' || groups.length === 0
                ? null
                : groups.map((field) => field.id),
        xAxisType: type === 'table' ? null : axisType,
        stackBars:
            type === 'bar' || type === 'horizontal'
                ? groups.length > 0 && stack
                : null,
        lineType: type === 'line' ? 'line' : null,
        xAxisLabel: type === 'table' ? '' : (dimension?.label ?? ''),
        yAxisLabel:
            type === 'table'
                ? ''
                : metrics.map((field) => field.label).join(', '),
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    });
    return parsed.success ? parsed.data : null;
};

const defaultChart = (shape: ReturnType<typeof getChartResultShape>) => {
    const temporal = shape.dimensions.filter((field) => field.temporal);
    const axis = temporal[0] ?? shape.dimensions[0];
    let type = 'table';
    if (
        axis &&
        temporal.length <= 1 &&
        axis.cardinality <= 30 &&
        axis.seriesCardinality <= 12 &&
        shape.metrics.length > 0 &&
        shape.metrics.every((metric) => metric.numeric)
    ) {
        if (axis.temporal) type = 'line';
        else type = axis.cardinality > 12 ? 'horizontal' : 'bar';
    }
    return (
        assembleChart(shape, type, axis?.id ?? null) ??
        assembleChart(shape, 'table', null)
    );
};

export const resolveChartPresentation = async ({
    decisions,
    question,
    query,
    explore,
    rows,
    resultFields,
    instructions = null,
    allowCorrection = true,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    question: string;
    query: ToolRunQueryArgsTransformed;
    explore: Explore;
    rows: Record<string, unknown>[];
    resultFields?: ItemsMap;
    instructions?: string | null;
    allowCorrection?: boolean;
}): Promise<{
    config: ToolRunQueryBuiltinChartConfig | null;
    advice: string[];
}> => {
    const fallback = { config: null, advice: [] };
    if (
        rows.length === 0 ||
        rows.length > 10_000 ||
        query.queryConfig.dimensions.length > 12 ||
        query.queryConfig.metrics.length +
            (query.queryConfig.tableCalculations?.length ?? 0) >
            12 ||
        isCustomChartTypeSlugChartConfig(query.chartConfig)
    )
        return fallback;
    const shape = getChartResultShape(query, explore, rows, resultFields);
    const baseline = defaultChart(shape);
    const unavailable = {
        config: query.chartConfig ? null : baseline,
        advice: [],
    };

    const types: Record<string, string> = {
        table: 'A table preserving all requested fields; use for detailed records or incompatible metric scales.',
        none: 'No confident supported chart choice; keep the existing presentation.',
    };
    const numericMetrics = shape.metrics.filter((metric) => metric.numeric);
    if (shape.dimensions.length > 0 && numericMetrics.length > 0) {
        types.bar = 'Vertical bars comparing categories.';
        types.horizontal =
            'Horizontal bars comparing categories, especially long labels or rankings.';
        types.line =
            'Lines for temporal trends or an explicitly ordered sequence.';
        if (shape.dimensions.length === 1 && shape.dimensions[0].numeric)
            types.scatter =
                'A scatter plot showing a relationship between a numeric dimension and a numeric measure.';
        if (
            shape.dimensions.length === 1 &&
            numericMetrics.length === 1 &&
            numericMetrics[0].nonNegative &&
            numericMetrics[0].hasPositiveValues
        ) {
            if (shape.dimensions[0].cardinality <= 6)
                types.pie =
                    'A small part-to-whole breakdown with at most six nonnegative categories.';
            types.funnel =
                'An explicitly ordered sequence of process stages, using the existing query order.';
        }
    }
    const questions: Record<string, DecisionQuestion> = {
        type: {
            type: 'choice',
            instructions:
                'Choose a presentation that answers the question using the computed result shape. Respect explicit visualization requests and agent instructions. Do not omit requested fields to make a chart fit. Use table for many categories or incompatible units, and none if uncertain.',
            criteria: types,
        },
        x: {
            type: 'choice',
            instructions:
                'Choose the existing dimension for the x-axis. Prefer the requested time dimension for a trend. Choose none for a table or no suitable axis.',
            criteria: {
                ...Object.fromEntries(
                    shape.dimensions.map((field) => [field.id, field.label]),
                ),
                none: 'No axis',
                keep: 'Keep existing axis',
            },
        },
        stack: {
            type: 'noul',
            instructions:
                'Does the question explicitly request stacked bars, or clearly ask for additive parts of a total that are comparable across categories? Unknown additivity, percentages and overlapping categories should not be stacked.',
        },
    };
    if (query.chartConfig) {
        questions.fit = {
            type: 'score',
            instructions:
                'Rate how well the proposed chart answers the question with this result shape, considering temporal axes, metric scales, series and category counts.',
            criteria: [
                'Misleading or loses requested information',
                'Difficult to read or inappropriate encoding',
                'Suitable and readable',
                'Clear and well suited',
            ],
        };
        questions.repair = {
            type: 'noul',
            instructions:
                'Does the proposed presentation clearly need replacement to avoid a misleading or unreadable chart, rather than merely admitting another reasonable style?',
        };
        questions.explicitStyle = {
            type: 'noul',
            instructions:
                'Did the user or agent instructions explicitly request the proposed visualization type or encoding? An explicit preference should be preserved even if another style would be easier to read.',
        };
    }
    const answers = await decisions.evaluate({
        operation: 'chart-presentation',
        state: {
            question,
            instructions,
            ...shape,
            proposed: query.chartConfig,
        },
        questions,
    });
    if (!answers) return unavailable;
    const { fit } = answers;
    const poorFit =
        fit?.type === 'score' && fit.confidence >= 0.7 && fit.score < 1.5;
    const advice = poorFit
        ? [
              'Review the chart encoding against the requested comparison, time axis and result cardinality.',
          ]
        : [];
    if (
        query.chartConfig &&
        !(
            allowCorrection &&
            poorFit &&
            (decisionProbability(answers.repair) ?? 0) >= 0.95 &&
            (decisionProbability(answers.explicitStyle) ?? 1) <= 0.05
        )
    )
        return { config: null, advice };

    const type = confidentChoice(answers.type, 0.6);
    if (!type || type === 'none' || !(type in types))
        return { config: unavailable.config, advice };
    const selectedAxis = confidentChoice(answers.x, 0.85);
    const x = shape.dimensions.some((field) => field.id === selectedAxis)
        ? selectedAxis
        : (baseline?.xAxisDimension ?? null);
    const config = assembleChart(
        shape,
        type,
        x,
        (decisionProbability(answers.stack) ?? 0) >= 0.95,
    );
    return { config: config ?? unavailable.config, advice };
};

export const getChartPresentationNote = ({
    config,
    advice,
}: Awaited<ReturnType<typeof resolveChartPresentation>>): string => {
    if (config)
        return ` Chart presentation selected from the result shape: ${JSON.stringify(config)}. The query and its scope are unchanged.`;
    if (advice.length > 0) return ` Chart review: ${advice.join(' ')}`;
    return '';
};
