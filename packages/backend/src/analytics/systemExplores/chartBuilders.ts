import { TableCalculationType } from '@lightdash/common';
import type { LibraryChartBinding } from './libraryCharts';
import type { UsageChartSpec } from './usageDashboardTypes';
import { usageFieldLabels } from './usageFieldLabels';

// The chart shapes the built-in dashboards share. Each one is a plain chart that every instance can
// draw, with the library chart that replaces it once that chart type is installed.

type Base = Pick<UsageChartSpec, 'key' | 'name' | 'description' | 'explore'> &
    Partial<Pick<UsageChartSpec, 'filters' | 'timezone' | 'fieldLabels'>>;

// A headline card: the plain version is a big number, the library version adds the daily trend behind it.
// A sum is safe to total over days. A distinct count or an average is not, so it shows the latest day in
// both versions.
export const card = ({
    day,
    metric,
    latestDay = false,
    hero = false,
    period = 'Selected period',
    history = 500,
    description,
    ...spec
}: Base & {
    day: string;
    metric: string;
    latestDay?: boolean;
    // The one wide card of a dashboard that also marks its highest and lowest day
    hero?: boolean;
    // What a summed card covers, when it is not the period of the Date filter
    period?: string;
    // Days of trend to draw, for a dashboard whose Date filter does not reach the card
    history?: number;
}): UsageChartSpec => ({
    ...spec,
    description,
    // Newest day first: the big number reads the first row, so it shows the latest day.
    dimensions: latestDay ? [day] : [],
    metrics: [metric],
    limit: 1,
    sorts: [{ fieldId: latestDay ? day : metric, descending: true }],
    visualization: 'number',
    libraryChart: {
        slug: 'big-number-with-sparkline-trend',
        minVersion: hero ? '0.8.0' : '0.7.1',
        fieldMapping: { value: metric, sparklineMetric: metric, time: day },
        optionValues: {
            ...(latestDay
                ? { valueAggregation: 'latest', showComparison: false }
                : {
                      valueAggregation: 'sum',
                      style: 'compact',
                      // No change badge: the chart can only compare one day with the day before,
                      // which says nothing about a total for the whole period.
                      showComparison: false,
                  }),
            ...(hero ? { showHighLow: true } : {}),
            colorSparklineByTrend: false,
            showSparklineArea: true,
            showLabel: true,
            label: latestDay ? 'Latest day' : period,
            showCardBorder: false,
            showCardShadow: false,
        },
        query: {
            dimensions: [day],
            metrics: [metric],
            sorts: [{ fieldId: day, descending: false }],
            limit: history,
            description,
        },
    },
});

// Smooth filled lines in full-width rows over a shared date axis, each row on its own scale.
export const trendRows = (
    panels: boolean,
): LibraryChartBinding['optionValues'] => ({
    arrangement: 'rows',
    minPanelHeight: 70,
    sharedY: false,
    markType: 'area',
    curve: 'smooth',
    fillOpacity: 25,
    showLine: true,
    showPoints: false,
    showPeakLabel: true,
    // A day with no rows for a category is a day with nothing to count. Only acts across panels.
    ...(panels ? { zeroFillGaps: true } : {}),
});

// One measure by day as a single full-width row.
export const trend = ({
    day,
    metric,
    tableCalculations,
    metrics,
    limit = 500,
    ...spec
}: Base &
    Partial<Pick<UsageChartSpec, 'tableCalculations'>> & {
        day: string;
        // The measure drawn: a metric, or a table calculation over `metrics`
        metric: string;
        metrics?: string[];
        limit?: number;
    }): UsageChartSpec => ({
    ...spec,
    dimensions: [day],
    metrics: metrics ?? [metric],
    ...(tableCalculations ? { tableCalculations } : {}),
    limit,
    sorts: [{ fieldId: day, descending: false }],
    visualization: 'line',
    xField: day,
    yFields: [metric],
    libraryChart: {
        slug: 'vega-trellis',
        minVersion: '0.7.0',
        fieldMapping: { x: day, value: metric },
        optionValues: trendRows(false),
        query: null,
    },
});

// One measure by day, one row per category. `top` keeps the categories with the largest totals.
export const trendByCategory = ({
    day,
    metric,
    category,
    top,
    identity = [],
    ...spec
}: Base & {
    day: string;
    metric: string;
    category: string;
    top?: number;
    // Columns that tell apart two categories with the same name, kept in the plain table
    identity?: string[];
}): UsageChartSpec => ({
    ...spec,
    dimensions: [day, category, ...identity],
    metrics: [metric],
    limit: 5000,
    sorts: [
        { fieldId: category, descending: false },
        { fieldId: day, descending: false },
    ],
    ...(top ? { topCategories: { category, metric, count: top } } : {}),
    libraryChart: {
        slug: 'vega-trellis',
        minVersion: '0.7.0',
        fieldMapping: { x: day, value: metric, panel: category },
        optionValues: trendRows(true),
        query: null,
    },
});

// How much of one measure each category had on each day.
export const heatmapByDay = ({
    day,
    metric,
    category,
    top,
    titles,
    identity = [],
    ...spec
}: Base & {
    day: string;
    metric: string;
    category: string;
    top?: number;
    identity?: string[];
    titles: { category: string; metric: string };
}): UsageChartSpec => ({
    ...spec,
    dimensions: [category, ...identity, day],
    metrics: [metric],
    limit: 5000,
    sorts: [
        { fieldId: category, descending: false },
        { fieldId: day, descending: false },
    ],
    ...(top ? { topCategories: { category, metric, count: top } } : {}),
    libraryChart: {
        slug: 'heatmap',
        minVersion: '0.5.0',
        fieldMapping: { x: day, y: category, value: metric },
        optionValues: {
            xTitle: 'Day',
            yTitle: titles.category,
            legendTitle: titles.metric,
            legendFormat: 'compact',
        },
        query: null,
    },
});

const dayAxis = {
    xAxisType: 'time',
    xTimeFormat: '{MMM} {d}',
    xName: 'Day',
};

// One measure by day, stacked by a category. The plain version is the total by day. The library version
// keeps the largest categories and groups the rest as Other.
export const stackedByDay = ({
    day,
    metric,
    splitBy,
    yName,
    top = 5,
    splitDescription,
    xAxis = dayAxis,
    colors,
    ...spec
}: Base & {
    day: string;
    metric: string;
    splitBy: string;
    yName: string;
    top?: number;
    // A fixed colour for each named category. The legend then shows even with one category present.
    colors?: Record<string, string>;
    // What the stacked version shows, for its own description
    splitDescription: string;
    xAxis?: LibraryChartBinding['optionValues'];
}): UsageChartSpec => ({
    ...spec,
    dimensions: [day],
    metrics: [metric],
    limit: 500,
    sorts: [{ fieldId: day, descending: false }],
    visualization: 'line',
    xField: day,
    yFields: [metric],
    libraryChart: {
        slug: 'customizable-cartesian-chart',
        minVersion: colors ? '0.18.4' : '0.18.3',
        fieldMapping: { x: day, m1: metric, splitBy },
        optionValues: {
            seriesType: 'bar',
            stack: 'normal',
            // Largest category at the bottom of every stack
            splitSort: 'total',
            ...xAxis,
            yName,
            splitTopN: top,
            ...(colors
                ? {
                      splitColorGroups: Object.entries(colors)
                          .map(([name, color]) => `${name}=${name}=${color}`)
                          .join(';'),
                      showLegend: true,
                  }
                : {}),
        },
        query: {
            dimensions: [day, splitBy],
            metrics: [metric],
            sorts: [
                { fieldId: splitBy, descending: false },
                { fieldId: day, descending: false },
            ],
            limit: 5000,
            description: splitDescription,
        },
    },
});

// Up to four measures by day, each with a plain series name.
export const seriesByDay = ({
    day,
    series,
    yName,
    stacked = false,
    seriesType = 'bar',
    rightAxis,
    ...spec
}: Base & {
    day: string;
    series: { metric: string; name: string }[];
    yName: string;
    stacked?: boolean;
    seriesType?: 'bar' | 'line';
    // Draws the last measure as a line on its own axis on the right
    rightAxis?: string;
}): UsageChartSpec => {
    const metrics = series.map(({ metric }) => metric);
    const slots = ['m1', 'm2', 'm3', 'm4'].slice(0, series.length);
    const last = slots[slots.length - 1];
    return {
        ...spec,
        dimensions: [day],
        metrics,
        limit: 500,
        sorts: [{ fieldId: day, descending: false }],
        visualization: 'line',
        xField: day,
        // A measure on its own axis cannot share the plain chart's single axis
        yFields: rightAxis ? metrics.slice(0, -1) : metrics,
        fieldLabels: {
            ...spec.fieldLabels,
            ...Object.fromEntries(
                series.map(({ metric, name }) => [metric, name]),
            ),
        },
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.0',
            fieldMapping: {
                x: day,
                ...Object.fromEntries(
                    slots.map((slot, index) => [slot, metrics[index]]),
                ),
            },
            optionValues: {
                seriesType,
                ...(stacked ? { stack: 'normal' } : {}),
                ...(seriesType === 'line' ? { showSymbols: true } : {}),
                ...dayAxis,
                yName,
                ...Object.fromEntries(
                    slots.map((slot, index) => [
                        `${slot}Name`,
                        series[index].name,
                    ]),
                ),
                ...(rightAxis
                    ? {
                          [`${last}Type`]: 'line',
                          dualAxis: true,
                          [`${last}Right`]: true,
                          yRightName: rightAxis,
                      }
                    : {}),
            },
            query: null,
        },
    };
};

// A ranking or a per-item breakdown. The plain version is a table that keeps the identifying columns.
// The library version groups by one or two names, with a bar in each cell, sorted by the first measure.
export const ranking = ({
    by,
    then,
    series,
    metrics,
    dimensions,
    limit = 50,
    libraryLimit,
    libraryDescription,
    visualization,
    extraMetrics = [],
    ...spec
}: Base &
    Partial<Pick<UsageChartSpec, 'visualization' | 'xField' | 'yFields'>> & {
        by: string;
        then?: string;
        // A category shown as one column per value
        series?: string;
        metrics: string[];
        // Columns of the plain table, when it shows more than the names the library version groups by
        dimensions?: string[];
        limit?: number;
        libraryLimit?: number;
        libraryDescription?: string;
        // Measures only the plain table shows, such as a date
        extraMetrics?: string[];
    }): UsageChartSpec => {
    const grouped = [by, ...(then ? [then] : []), ...(series ? [series] : [])];
    // A table grouped by two names adds up the rows under each first name. Rows are asked for a
    // whole group at a time, largest group first, so when the row limit cuts the list it drops small
    // groups and every group shown has all of its rows: its total is the true total.
    const tableOf = (field: string) =>
        [spec.explore, 'content_health', 'agent_requests'].find((table) =>
            field.startsWith(`${table}_`),
        );
    const table = tableOf(metrics[0]);
    const groupTotal =
        then && !series && table && tableOf(by) === table
            ? {
                  name: 'group_total',
                  displayName: 'Group total',
                  type: TableCalculationType.NUMBER,
                  sql: `SUM(\${${table}.${metrics[0].slice(table.length + 1)}}) OVER (PARTITION BY \${${table}.${by.slice(table.length + 1)}})`,
              }
            : undefined;
    // The table takes its headers from these names, not from the field labels of the explore
    const labelOf = (field: string) => {
        const label = spec.fieldLabels?.[field] ?? usageFieldLabels[field];
        if (!label || label.includes(','))
            throw new Error(`No plain column name for ${field}`);
        return label;
    };
    return {
        ...spec,
        dimensions: dimensions ?? grouped,
        metrics: [...metrics, ...extraMetrics],
        limit,
        sorts: [{ fieldId: metrics[0], descending: true }],
        ...(visualization ? { visualization } : {}),
        libraryChart: {
            slug: 'sortable-pivot-table',
            minVersion: '0.14.0',
            fieldMapping: {
                rowDimension: by,
                ...(then ? { rowDimension2: then } : {}),
                ...(series ? { series } : {}),
                metric: metrics,
            },
            // A total over the rows shown is not the total for everything, so there is no totals row.
            optionValues: {
                showMiniBars: true,
                showTotalsRow: false,
                decimalPlaces: 0,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: [by, ...(then ? [then] : [])]
                    .map(labelOf)
                    .join(' / '),
                valueNames: metrics.map(labelOf).join(','),
                ...(then ? { defaultCollapsed: 'collapsed' } : {}),
            },
            query: {
                dimensions: grouped,
                metrics,
                ...(groupTotal ? { tableCalculations: [groupTotal] } : {}),
                sorts: [
                    ...(groupTotal
                        ? [
                              { fieldId: groupTotal.name, descending: true },
                              { fieldId: by, descending: false },
                          ]
                        : []),
                    { fieldId: metrics[0], descending: true },
                ],
                // A group's total adds up the rows under it, so a table grouped by two names asks for
                // every row it can: a short list would leave the totals short of the same count elsewhere
                limit: libraryLimit ?? (then ? 5000 : 500),
                description: libraryDescription ?? spec.description,
            },
        },
    };
};

// Names sized by a count. The plain version is a bar chart of the largest.
export const cloud = ({
    word,
    metric,
    ...spec
}: Base & { word: string; metric: string }): UsageChartSpec => ({
    ...spec,
    dimensions: [word],
    metrics: [metric],
    limit: 20,
    sorts: [{ fieldId: metric, descending: true }],
    visualization: 'bar',
    xField: word,
    flipAxes: true,
    libraryChart: {
        slug: 'word-cloud',
        minVersion: '0.4.0',
        fieldMapping: { word, size: metric },
        optionValues: { showLegend: false },
        query: {
            dimensions: [word],
            metrics: [metric],
            sorts: [{ fieldId: metric, descending: true }],
            limit: 80,
            description: spec.description,
        },
    },
});
