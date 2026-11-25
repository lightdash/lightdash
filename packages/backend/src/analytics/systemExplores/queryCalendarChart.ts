import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    FilterOperator,
    UnitOfTime,
    type ChartAsCode,
} from '@lightdash/common';
import { analyticsColorPalette } from './analyticsColorPalette';

const day = 'query_calendar_day';
const queries = 'query_events_total_queries';
// The day's queries as a number
const count = 'query_count';
const ink = '#868E96';

// The calendar always shows the same window, so it fills its tile whatever the dashboard's date range.
export const queryCalendarWeeks = 26;
const windowDays = queryCalendarWeeks * 7;
// 26 weeks of days touch at most 27 calendar weeks, one column each
const columns = queryCalendarWeeks + 1;
const dayMs = 86400000;
// Pixels: the columns share the full width, and a row is at most 1.4 times as tall as a column is wide,
// so on a very wide tile the cells become wide rectangles instead of leaving the right side empty
const step = `(width / ${columns})`;
const unit = `min(1.4 * ${step}, (height - 72) / 7)`;
const gridTop = 46;

// Days of the window as a grid, whether or not they have data. Runs on one row, after `firstRow`.
const windowGrid = [
    {
        calculate: `sequence(0, ${columns * 7})`,
        as: 'grid_days',
    },
    { flatten: ['grid_days'] },
    {
        calculate: `datum.start_monday + datum.grid_days * ${dayMs}`,
        as: 'grid_day',
    },
    {
        filter: 'datum.grid_day >= datum.window_start && datum.grid_day <= datum.last_day',
    },
    { calculate: 'floor(datum.grid_days / 7)', as: 'week' },
    { calculate: 'datum.grid_days % 7', as: 'weekday' },
];
// Where a day's cell is drawn, from its week and weekday
const cellPixels = [
    { calculate: `datum.week * ${step}`, as: 'cell_x' },
    { calculate: `(datum.week + 0.88) * ${step}`, as: 'cell_x2' },
    { calculate: `${gridTop} + datum.weekday * ${unit}`, as: 'cell_y' },
    {
        calculate: `${gridTop} + (datum.weekday + 0.88) * ${unit}`,
        as: 'cell_y2',
    },
];

// Calendar arithmetic uses UTC to preserve the returned date-only bucket in
// every browser timezone. No query aggregation or missing-day value is changed.
export const queryCalendarSpec: Record<string, unknown> = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    autosize: { type: 'fit', contains: 'padding' },
    padding: { left: 34, right: 12, top: 8, bottom: 10 },
    transform: [
        {
            calculate: `utcParse(substring(toString(datum.${day}), 0, 10), '%Y-%m-%d')`,
            as: 'day',
        },
        // The count can arrive as text, and text sorts "890" above "5000"
        { calculate: `toNumber(datum.${queries})`, as: count },
        { filter: `isValid(datum.day) && isFinite(datum.${count})` },
        { joinaggregate: [{ op: 'max', field: 'day', as: 'last_day' }] },
        // The window ends on the latest day with data and starts 26 weeks before it
        {
            calculate: `toNumber(datum.last_day) - ${windowDays - 1} * ${dayMs}`,
            as: 'window_start',
        },
        { filter: 'toNumber(datum.day) >= datum.window_start' },
        {
            calculate: `toNumber(datum.last_day) - ((utcday(datum.last_day) + 6) % 7) * ${dayMs} - ${queryCalendarWeeks * 7} * ${dayMs}`,
            as: 'start_monday',
        },
        // The colours stop at about the 95th percentile of the daily values, so one very busy day takes
        // the darkest colour without turning every other day pale. The cut-off is the smallest of the
        // busiest 5% of days, ranked on the count as a number.
        { joinaggregate: [{ op: 'count', as: 'day_count' }] },
        {
            window: [{ op: 'row_number', as: 'busiest_rank' }],
            sort: [{ field: count, order: 'descending' }],
        },
        {
            calculate: `datum.busiest_rank <= max(1, ceil(datum.day_count * 0.05)) ? datum.${count} : null`,
            as: 'busiest_value',
        },
        {
            joinaggregate: [
                { op: 'min', field: 'busiest_value', as: 'colour_top' },
            ],
        },
        {
            calculate: `min(datum.${count}, datum.colour_top)`,
            as: 'colour_value',
        },
        { calculate: '(utcday(datum.day) + 6) % 7', as: 'weekday' },
        {
            calculate: `floor((toNumber(datum.day) - datum.start_monday) / ${7 * dayMs})`,
            as: 'week',
        },
        ...cellPixels,
        { calculate: "utcFormat(datum.day, '%A, %d %B %Y')", as: 'date_label' },
        {
            window: [{ op: 'row_number', as: 'row' }],
            sort: [{ field: 'day', order: 'ascending' }],
        },
    ],
    layer: [],
    config: {
        view: { stroke: null },
        font: 'Inter, Arial, sans-serif',
        // The legend sits above the right end of the grid, on the line of the date range
        legend: {
            orient: 'top-right',
            direction: 'horizontal',
            titleOrient: 'left',
            titleAnchor: 'middle',
            titleFontSize: 11,
            titleFontWeight: 'normal',
            titleColor: ink,
            labelColor: ink,
            labelFontSize: 10,
            gradientLength: 140,
            gradientThickness: 8,
            offset: 0,
        },
    },
};

const pixels = { type: 'quantitative', scale: null, axis: null };
const calendarPosition = {
    x: { field: 'cell_x', ...pixels },
    x2: { field: 'cell_x2' },
    y: { field: 'cell_y', ...pixels },
    y2: { field: 'cell_y2' },
};
const tooltip = [
    { field: 'date_label', type: 'nominal', title: 'Day' },
    { field: count, type: 'quantitative', title: 'Queries', format: ',.0f' },
];
const firstRow = { filter: 'datum.row === 1' };

queryCalendarSpec.layer = [
    {
        transform: [
            firstRow,
            {
                calculate:
                    "utcFormat(datum.window_start, width < 500 ? '%d %b %y' : '%d %b %Y') + ' – ' + utcFormat(datum.last_day, width < 500 ? '%d %b %y' : '%d %b %Y') + ' · UTC'",
                as: 'range_label',
            },
        ],
        mark: { type: 'text', align: 'left', color: ink, fontSize: 12 },
        encoding: {
            x: { value: 0 },
            y: { value: 8 },
            text: { field: 'range_label' },
        },
    },
    {
        // Every day of the window in grey, so a day with no data still has its cell
        transform: [
            firstRow,
            ...windowGrid,
            ...cellPixels,
            {
                calculate: "utcFormat(datum.grid_day, '%A, %d %B %Y')",
                as: 'grid_label',
            },
            { calculate: "'No recorded data'", as: 'missing_label' },
        ],
        mark: {
            type: 'rect',
            cornerRadius: 2,
            color: ink,
            opacity: 0.14,
            aria: false,
        },
        encoding: {
            ...calendarPosition,
            tooltip: [
                { field: 'grid_label', title: 'Day' },
                { field: 'missing_label', title: 'Queries' },
            ],
        },
    },
    {
        mark: { type: 'rect', cornerRadius: 2 },
        encoding: {
            ...calendarPosition,
            color: {
                field: 'colour_value',
                type: 'quantitative',
                // Up to full strength of the first colour of the Analytics palette. The light end is
                // dark enough to tell a quiet day from a day with no data
                scale: {
                    domainMin: 0,
                    range: [
                        '#C7D2FE',
                        analyticsColorPalette.colors[16],
                        analyticsColorPalette.colors[0],
                    ],
                },
                legend: {
                    title: 'Queries per day',
                    // Zero, half way and the top of the colours
                    values: {
                        expr: "[0, domain('color')[1] / 2, domain('color')[1]]",
                    },
                    // 9.3K, not 9.313k. The top label ends in + because busier days share its colour
                    labelExpr:
                        "isFinite(datum.value) ? upper(format(datum.value, '.2~s')) + (datum.value >= domain('color')[1] ? '+' : '') : ''",
                },
            },
            tooltip,
        },
    },
    {
        // A label over the week each month starts in, and over the first week when there is room
        // before the next one
        transform: [
            firstRow,
            ...windowGrid,
            {
                filter: 'utcdate(datum.grid_day) === 1 || (datum.grid_day === datum.window_start && utcdate(datum.grid_day) > 1 && utcdate(datum.grid_day) <= 12)',
            },
            {
                calculate:
                    "utcFormat(datum.grid_day, utcmonth(datum.grid_day) === 0 || datum.grid_day === datum.window_start ? '%b %Y' : '%b')",
                as: 'month_label',
            },
            { calculate: `datum.week * ${step}`, as: 'cell_x' },
        ],
        mark: {
            type: 'text',
            align: 'left',
            baseline: 'bottom',
            fontSize: 11,
            color: ink,
        },
        encoding: {
            x: calendarPosition.x,
            y: { value: gridTop - 6 },
            text: { field: 'month_label' },
        },
    },
    {
        transform: [
            firstRow,
            { calculate: 'sequence(0, 7)', as: 'weekday' },
            { flatten: ['weekday'] },
            // Every other weekday when the rows are too short for all seven
            { filter: `${unit} >= 13 || datum.weekday % 2 === 0` },
            {
                calculate: `${gridTop} + (datum.weekday + 0.44) * ${unit}`,
                as: 'cell_y',
            },
            {
                calculate:
                    "['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][datum.weekday]",
                as: 'weekday_label',
            },
        ],
        mark: {
            type: 'text',
            align: 'right',
            baseline: 'middle',
            dx: -7,
            color: ink,
            fontSize: 10,
        },
        encoding: {
            x: { value: 0 },
            y: calendarPosition.y,
            text: { field: 'weekday_label' },
        },
    },
    {
        transform: [firstRow],
        mark: { type: 'text', align: 'left', color: ink, fontSize: 10 },
        encoding: {
            x: { value: 0 },
            y: { value: { expr: `${gridTop} + 7 * ${unit} + 10` } },
            text: { value: 'Grey: no recorded data' },
        },
    },
];

export const buildQueryCalendarChart = (source: ChartAsCode): ChartAsCode => ({
    ...source,
    slug: 'lightdash-analytics-query-activity-query-calendar',
    name: 'Queries by day (calendar)',
    description:
        'Queries per UTC day over the last 26 weeks; grey means no recorded data. The date filter does not change this tile.',
    metricQuery: {
        ...source.metricQuery,
        dimensions: [day],
        // Its own period: a chart that sets one is left alone by the dashboard's date filter
        filters: {
            dimensions: {
                id: 'query-calendar-window',
                and: [
                    {
                        id: 'query-calendar-window-days',
                        target: { fieldId: 'query_events_event_ts_raw' },
                        operator: FilterOperator.IN_THE_PAST,
                        values: [windowDays],
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: false,
                        },
                    },
                ],
            },
        },
        sorts: [{ fieldId: day, descending: false }],
        timezone: 'UTC',
        customDimensions: [
            {
                id: day,
                name: 'UTC day',
                table: 'query_events',
                type: CustomDimensionType.SQL,
                dimensionType: DimensionType.STRING,
                // A string bucket deliberately opts this daily calendar out of
                // dashboard date zoom, which would turn day cells into month totals.
                sql: 'CAST(${query_events.event_ts_day} AS VARCHAR)',
            },
        ],
    },
    tableConfig: { columnOrder: [day, queries] },
    chartConfig: {
        type: ChartType.CUSTOM,
        config: { spec: queryCalendarSpec },
    },
});
