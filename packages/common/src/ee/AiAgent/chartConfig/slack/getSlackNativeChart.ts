import {
    isDimension,
    isTimeBasedDimension,
    type ItemsMap,
} from '../../../../types/field';
import { type SortField } from '../../../../types/metricQuery';
import { formatItemValue } from '../../../../utils/formatting';
import { isTimeInterval } from '../../../../utils/timeFrames';
import {
    isCustomChartTypeSlugChartConfig,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
} from '../../schemas';
import { formatFieldLabel } from '../shared/formatFieldLabel';
import { type GetPivotedResultsFn, type QueryResults } from './types';

const MAX_TITLE_LENGTH = 50;
const MAX_LABEL_LENGTH = 20;
const MAX_CATEGORIES = 20;
const MAX_SERIES = 12;

/** Slack's native chart block; its schema rejects any field not listed here. */
export type SlackDataVisualizationBlock = {
    type: 'data_visualization';
    block_id: string;
    title: string;
    chart: {
        type: 'bar' | 'line';
        series: Array<{
            name: string;
            data: Array<{ label: string; value: number }>;
        }>;
        axis_config: {
            categories: string[];
            x_label?: string;
            y_label?: string;
        };
    };
};

export type SlackNativeChartImageReason =
    | 'unsupported_type'
    | 'horizontal_bar'
    | 'area'
    | 'secondary_axis'
    | 'stacked'
    | 'no_rows'
    | 'no_x_axis'
    | 'no_series'
    | 'too_many_categories'
    | 'too_many_series'
    | 'missing_value'
    | 'non_numeric_value'
    | 'invalid_time_value'
    | 'empty_label'
    | 'duplicate_category'
    | 'duplicate_series'
    | 'category_label_collision'
    | 'series_label_collision';

export type SlackNativeChartRoute =
    | { route: 'native'; block: SlackDataVisualizationBlock }
    | { route: 'image'; reason: SlackNativeChartImageReason };

type NativeChartConfig = ToolRunQueryBuiltinChartConfig & {
    defaultVizType: 'bar' | 'line';
};

/** Rules that need no rows: chart type and axis layout. */
export const getSlackNativeChartConfigGate = (
    queryTool: ToolRunQueryArgsTransformed,
):
    | { eligible: true; chartConfig: NativeChartConfig }
    | { eligible: false; reason: SlackNativeChartImageReason } => {
    const { chartConfig } = queryTool;
    if (!chartConfig || isCustomChartTypeSlugChartConfig(chartConfig))
        return { eligible: false, reason: 'unsupported_type' };
    const { defaultVizType } = chartConfig;
    if (defaultVizType === 'horizontal')
        return { eligible: false, reason: 'horizontal_bar' };
    if (defaultVizType !== 'bar' && defaultVizType !== 'line')
        return { eligible: false, reason: 'unsupported_type' };
    if (defaultVizType === 'line' && chartConfig.lineType === 'area')
        return { eligible: false, reason: 'area' };
    if (chartConfig.secondaryYAxisMetric)
        return { eligible: false, reason: 'secondary_axis' };
    return { eligible: true, chartConfig: { ...chartConfig, defaultVizType } };
};

const truncate = (text: string, maximum: number): string => {
    if (text.length <= maximum) return text;
    let shortened = '';
    for (const character of text) {
        if (shortened.length + character.length > maximum - 1) break;
        shortened += character;
    }
    return `${shortened}…`;
};

/** Truncated labels, or why they cannot be used as unique Slack labels. */
const toSlackLabels = (
    labels: string[],
    reasons: {
        duplicate: SlackNativeChartImageReason;
        collision: SlackNativeChartImageReason;
    },
): { labels: string[] } | { reason: SlackNativeChartImageReason } => {
    if (labels.some((label) => label.length === 0))
        return { reason: 'empty_label' };
    if (new Set(labels).size !== labels.length)
        return { reason: reasons.duplicate };
    const truncated = labels.map((label) => truncate(label, MAX_LABEL_LENGTH));
    if (new Set(truncated).size !== truncated.length)
        return { reason: reasons.collision };
    return { labels: truncated };
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

const toDate = (value: unknown): Date | null => {
    let date: Date | null = null;
    if (value instanceof Date) date = value;
    else if (typeof value === 'number') date = new Date(value);
    else if (typeof value === 'string') {
        const text = value.trim();
        if (DATE_ONLY.test(text)) date = new Date(`${text}T00:00:00Z`);
        else if (text.length > 0) {
            const iso = text.replace(' ', 'T');
            date = new Date(HAS_TIMEZONE.test(iso) ? iso : `${iso}Z`);
        }
    }
    return date && Number.isFinite(date.getTime()) ? date : null;
};

/** Labels as compact as the dates allow: a field's time grain formats like the image axis. */
const formatDates = (
    dates: Date[],
    values: unknown[],
    field: ItemsMap[string] | undefined,
): string[] => {
    if (
        isDimension(field) &&
        field.timeInterval &&
        isTimeInterval(field.timeInterval)
    )
        return values.map((value) => formatItemValue(field, value, true));
    const iso = dates.map((date) => date.toISOString());
    const isMidnight = iso.every((text) => text.endsWith('T00:00:00.000Z'));
    if (isMidnight && iso.length >= 2) {
        if (iso.every((text) => text.slice(5, 10) === '01-01'))
            return iso.map((text) => text.slice(0, 4));
        if (iso.every((text) => text.slice(8, 10) === '01'))
            return iso.map((text) => text.slice(0, 7));
    }
    const hasTime = iso.some((text) => !text.endsWith('T00:00:00.000Z'));
    const hasSeconds = iso.some((text) => !text.endsWith(':00.000Z'));
    return iso.map((text) => {
        if (!hasTime) return text.slice(0, 10);
        return `${text.slice(0, 10)} ${text.slice(11, hasSeconds ? 19 : 16)}`;
    });
};

const NUMERIC_STRING = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

const toValue = (
    value: unknown,
): number | 'missing_value' | 'non_numeric_value' => {
    if (value === null || value === undefined) return 'missing_value';
    let number: number | null = null;
    if (typeof value === 'number') number = value;
    else if (typeof value === 'bigint') number = Number(value);
    else if (typeof value === 'string' && NUMERIC_STRING.test(value.trim()))
        number = Number(value.trim());
    return number === null || !Number.isFinite(number)
        ? 'non_numeric_value'
        : number;
};

/**
 * Routes a runQuery-shaped chart to Slack's native chart block or the PNG
 * image. Takes what the ECharts builders take, so both draw the same data.
 */
export const getSlackNativeChart = async ({
    queryTool,
    queryResults,
    getPivotedResults,
    blockId,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    queryResults: QueryResults;
    getPivotedResults: GetPivotedResultsFn;
    blockId: string;
}): Promise<SlackNativeChartRoute> => {
    const gate = getSlackNativeChartConfigGate(queryTool);
    if (!gate.eligible) return { route: 'image', reason: gate.reason };
    const { chartConfig } = gate;
    const { rows, fields: fieldsMap } = queryResults;
    if (rows.length === 0) return { route: 'image', reason: 'no_rows' };

    const { dimensions, metrics: queryMetrics, sorts } = queryTool.queryConfig;
    const xDimension = chartConfig.xAxisDimension || dimensions[0];
    if (!xDimension) return { route: 'image', reason: 'no_x_axis' };
    const yMetrics = chartConfig.yAxisMetrics || queryMetrics;

    let chartRows = rows;
    let metrics = yMetrics;
    let getSeriesName = (key: string) => formatFieldLabel(key, fieldsMap);
    if (chartConfig.groupBy?.length) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            chartConfig.groupBy,
            yMetrics,
            [],
            sorts as SortField[],
        );
        chartRows = pivoted.results;
        metrics = pivoted.metrics;
        getSeriesName = (key: string) => pivoted.labels[key] ?? '';
    }

    if (metrics.length === 0) return { route: 'image', reason: 'no_series' };
    if (metrics.length > MAX_SERIES)
        return { route: 'image', reason: 'too_many_series' };
    if (
        chartConfig.defaultVizType === 'bar' &&
        chartConfig.stackBars &&
        metrics.length > 1
    )
        return { route: 'image', reason: 'stacked' };
    if (chartRows.length > MAX_CATEGORIES)
        return { route: 'image', reason: 'too_many_categories' };

    const isTimeAxis =
        (chartConfig.xAxisType ??
            (chartConfig.defaultVizType === 'line' ? 'time' : 'category')) ===
        'time';
    const xValues = chartRows.map((row) => row[xDimension]);
    let order = chartRows.map((_, index) => index);
    let rawLabels: string[];
    if (
        isTimeAxis ||
        isTimeBasedDimension(fieldsMap[xDimension]) ||
        xValues.every((value) => value instanceof Date)
    ) {
        const dates = xValues.map(toDate);
        if (dates.some((date) => date === null))
            return { route: 'image', reason: 'invalid_time_value' };
        const validDates = dates as Date[];
        rawLabels = formatDates(validDates, xValues, fieldsMap[xDimension]);
        // ECharts' time axis sorts chronologically.
        if (isTimeAxis)
            order = [...order].sort(
                (left, right) =>
                    validDates[left].getTime() - validDates[right].getTime(),
            );
    } else {
        rawLabels = xValues.map((value) =>
            value === null || value === undefined ? '' : String(value).trim(),
        );
    }
    // Mirrors the image: a descending sort on x inverts a category axis.
    const primarySort = sorts?.[0];
    if (
        !isTimeAxis &&
        primarySort?.fieldId === xDimension &&
        primarySort.descending === true
    )
        order = [...order].reverse();

    const categories = toSlackLabels(
        order.map((index) => rawLabels[index]),
        {
            duplicate: 'duplicate_category',
            collision: 'category_label_collision',
        },
    );
    if ('reason' in categories)
        return { route: 'image', reason: categories.reason };
    const seriesNames = toSlackLabels(
        metrics.map((metric) => getSeriesName(metric).trim()),
        { duplicate: 'duplicate_series', collision: 'series_label_collision' },
    );
    if ('reason' in seriesNames)
        return { route: 'image', reason: seriesNames.reason };

    const series: SlackDataVisualizationBlock['chart']['series'] = [];
    for (const [seriesIndex, metric] of metrics.entries()) {
        const data: Array<{ label: string; value: number }> = [];
        for (const [position, rowIndex] of order.entries()) {
            const value = toValue(chartRows[rowIndex][metric]);
            if (typeof value === 'string')
                return { route: 'image', reason: value };
            data.push({ label: categories.labels[position], value });
        }
        series.push({ name: seriesNames.labels[seriesIndex], data });
    }

    const xLabel = chartConfig.xAxisLabel?.trim();
    const yLabel = chartConfig.yAxisLabel?.trim();
    return {
        route: 'native',
        block: {
            type: 'data_visualization',
            block_id: blockId,
            title: truncate(
                queryTool.title?.trim() || 'Chart',
                MAX_TITLE_LENGTH,
            ),
            chart: {
                type: chartConfig.defaultVizType,
                series,
                axis_config: {
                    categories: categories.labels,
                    ...(xLabel
                        ? { x_label: truncate(xLabel, MAX_TITLE_LENGTH) }
                        : {}),
                    ...(yLabel
                        ? { y_label: truncate(yLabel, MAX_TITLE_LENGTH) }
                        : {}),
                },
            },
        },
    };
};
