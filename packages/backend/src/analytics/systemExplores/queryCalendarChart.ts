import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    type ChartAsCode,
} from '@lightdash/common';

const day = 'query_calendar_day';
const queries = 'query_events_total_queries';
const ink = '#868E96';

// Calendar arithmetic uses UTC to preserve the returned date-only bucket in
// every browser timezone. No query aggregation or missing-day value is changed.
export const queryCalendarSpec: Record<string, unknown> = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    autosize: { type: 'fit', contains: 'padding' },
    padding: { left: 34, right: 12, top: 8, bottom: 10 },
    transform: [
        { joinaggregate: [{ op: 'count', as: 'source_rows' }] },
        {
            calculate: `utcParse(substring(toString(datum.${day}), 0, 10), '%Y-%m-%d')`,
            as: 'day',
        },
        { filter: `isValid(datum.day) && isValid(datum.${queries})` },
        {
            joinaggregate: [
                { op: 'min', field: 'day', as: 'first_day' },
                { op: 'max', field: 'day', as: 'last_day' },
            ],
        },
        { calculate: '(utcday(datum.day) + 6) % 7', as: 'weekday' },
        {
            calculate:
                'toNumber(datum.first_day) - ((utcday(datum.first_day) + 6) % 7) * 86400000',
            as: 'first_monday',
        },
        {
            calculate:
                'floor((toNumber(datum.day) - datum.first_monday) / 604800000)',
            as: 'week',
        },
        {
            calculate:
                'floor((toNumber(datum.last_day) - datum.first_monday) / 604800000) + 1',
            as: 'weeks',
        },
        {
            calculate:
                'max(ceil(width / 28), min(datum.weeks, max(8, floor(width / 14))))',
            as: 'columns',
        },
        { calculate: 'ceil(datum.weeks / datum.columns)', as: 'bands' },
        // Short histories keep compact cells rather than a tall strip on the
        // left. Long and folded calendars retain their existing coordinates.
        {
            calculate:
                'datum.weeks < datum.columns ? (1 - datum.weeks / datum.columns) / 2 : 0',
            as: 'column_offset',
        },
        {
            calculate:
                'datum.weeks < datum.columns ? min(1, datum.bands * 9 * 28 / max(1, height - 76)) : 1',
            as: 'row_scale',
        },
        { calculate: 'floor(datum.week / datum.columns)', as: 'band' },
        { calculate: 'datum.week % datum.columns', as: 'column' },
        {
            calculate: 'datum.column / datum.columns + datum.column_offset',
            as: 'cell_x',
        },
        {
            calculate:
                '(datum.column + 0.88) / datum.columns + datum.column_offset',
            as: 'cell_x2',
        },
        {
            calculate:
                '0.5 + ((datum.band * 9 + 1 + datum.weekday) / (datum.bands * 9) - 0.5) * datum.row_scale',
            as: 'cell_y',
        },
        {
            calculate:
                '0.5 + ((datum.band * 9 + 1.88 + datum.weekday) / (datum.bands * 9) - 0.5) * datum.row_scale',
            as: 'cell_y2',
        },
        { calculate: "utcFormat(datum.day, '%A, %d %B %Y')", as: 'date_label' },
        {
            window: [{ op: 'row_number', as: 'row' }],
            sort: [{ field: 'day', order: 'ascending' }],
        },
    ],
    resolve: { scale: { x: 'independent', y: 'independent' } },
    layer: [],
    config: {
        view: { stroke: null },
        font: 'Inter, Arial, sans-serif',
        axis: {
            domain: false,
            grid: false,
            tickColor: ink,
            labelColor: ink,
            titleColor: ink,
            labelFontSize: 10,
            titleFontSize: 11,
        },
        legend: {
            orient: 'bottom',
            direction: 'horizontal',
            titleFontSize: 11,
            labelFontSize: 10,
            gradientLength: 160,
            gradientThickness: 8,
            offset: 12,
        },
    },
};

const calendarPosition = {
    x: {
        field: 'cell_x',
        type: 'quantitative',
        scale: { domain: [0, 1], nice: false, zero: false },
        axis: null,
    },
    x2: { field: 'cell_x2' },
    y: {
        field: 'cell_y',
        type: 'quantitative',
        scale: {
            domain: [0, 1],
            range: [36, { expr: 'height - 40' }],
            nice: false,
            zero: false,
        },
        axis: null,
    },
    y2: { field: 'cell_y2' },
};
const tooltip = [
    { field: 'date_label', type: 'nominal', title: 'Day' },
    { field: queries, type: 'quantitative', title: 'Queries', format: ',.0f' },
];
const calendarFits = {
    filter: 'datum.weeks <= 104 && (height - 76) / (datum.bands * 9) >= 9',
};
const firstRow = { filter: 'datum.row === 1' };

queryCalendarSpec.layer = [
    {
        transform: [
            firstRow,
            {
                calculate:
                    "utcFormat(datum.first_day, width < 500 ? '%d %b %y' : '%d %b %Y') + ' – ' + utcFormat(datum.last_day, width < 500 ? '%d %b %y' : '%d %b %Y') + ' · UTC'",
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
        // Bound the neutral calendar scaffold independently from the row cap:
        // 500 sparse observations can span many years. The native trend remains
        // available beside this calendar when that span cannot fit legibly.
        transform: [
            firstRow,
            calendarFits,
            { calculate: 'sequence(0, datum.weeks * 7)', as: 'grid_days' },
            { flatten: ['grid_days'] },
            {
                calculate: 'datum.first_monday + datum.grid_days * 86400000',
                as: 'grid_day',
            },
            {
                filter: 'datum.grid_day >= datum.first_day && datum.grid_day <= datum.last_day',
            },
            { calculate: 'floor(datum.grid_days / 7)', as: 'grid_week' },
            {
                calculate:
                    '(datum.grid_week % datum.columns) / datum.columns + datum.column_offset',
                as: 'cell_x',
            },
            {
                calculate:
                    '(datum.grid_week % datum.columns + 0.88) / datum.columns + datum.column_offset',
                as: 'cell_x2',
            },
            {
                calculate:
                    '0.5 + ((floor(datum.grid_week / datum.columns) * 9 + 1 + datum.grid_days % 7) / (datum.bands * 9) - 0.5) * datum.row_scale',
                as: 'cell_y',
            },
            {
                calculate:
                    '0.5 + ((floor(datum.grid_week / datum.columns) * 9 + 1.88 + datum.grid_days % 7) / (datum.bands * 9) - 0.5) * datum.row_scale',
                as: 'cell_y2',
            },
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
        transform: [calendarFits],
        mark: { type: 'rect', cornerRadius: 2 },
        encoding: {
            ...calendarPosition,
            color: {
                field: queries,
                type: 'quantitative',
                scale: {
                    domainMin: 0,
                    range: ['#D0EBFF', '#748FFC', '#364FC7'],
                },
                legend: {
                    title: 'Queries / day',
                    format: '~s',
                    // The calendar can deliberately hide a range that cannot fit.
                    // Its empty color domain must not expose NaN legend labels.
                    gradientOpacity: {
                        expr: "isFinite(domain('color')[1]) ? 1 : 0",
                    },
                    labelOpacity: {
                        expr: "isFinite(domain('color')[1]) ? 1 : 0",
                    },
                    titleOpacity: {
                        expr: "isFinite(domain('color')[1]) ? 1 : 0",
                    },
                    labelExpr:
                        "isFinite(datum.value) ? format(datum.value, '~s') : ''",
                },
            },
            tooltip,
        },
    },
    {
        transform: [
            calendarFits,
            {
                joinaggregate: [{ op: 'min', field: 'day', as: 'band_start' }],
                groupby: ['band'],
            },
            {
                filter: 'datum.day === datum.band_start || (utcdate(datum.day) === 1 && datum.column >= 4 && datum.column < datum.columns - 3)',
            },
            {
                calculate:
                    "utcFormat(datum.day, utcmonth(datum.day) === 0 || datum.day === datum.band_start ? '%b %Y' : '%b')",
                as: 'month_label',
            },
            {
                calculate:
                    '0.5 + ((datum.band * 9 + 0.25) / (datum.bands * 9) - 0.5) * datum.row_scale',
                as: 'cell_y',
            },
        ],
        mark: { type: 'text', align: 'left', fontSize: 11, color: ink },
        encoding: {
            x: calendarPosition.x,
            y: calendarPosition.y,
            text: { field: 'month_label' },
        },
    },
    {
        transform: [
            firstRow,
            calendarFits,
            { calculate: 'sequence(0, datum.bands * 7)', as: 'labels' },
            { flatten: ['labels'] },
            {
                filter: '(height - 76) / (datum.bands * 9) >= 13 || datum.labels % 7 === 0 || datum.labels % 7 === 2 || datum.labels % 7 === 4 || datum.labels % 7 === 6',
            },
            {
                calculate:
                    '0.5 + ((floor(datum.labels / 7) * 9 + 1.44 + datum.labels % 7) / (datum.bands * 9) - 0.5) * datum.row_scale',
                as: 'cell_y',
            },
            {
                calculate:
                    "['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][datum.labels % 7]",
                as: 'weekday_label',
            },
        ],
        mark: {
            type: 'text',
            align: 'right',
            dx: -7,
            color: ink,
            fontSize: 10,
        },
        encoding: {
            x: { ...calendarPosition.x, field: 'column_offset' },
            y: calendarPosition.y,
            text: { field: 'weekday_label' },
        },
    },
    {
        transform: [
            firstRow,
            {
                filter: 'datum.weeks > 104 || (height - 76) / (datum.bands * 9) < 9',
            },
        ],
        mark: { type: 'text', align: 'left', fontSize: 12, color: ink },
        encoding: {
            x: { value: 0 },
            y: { value: 60 },
            text: { value: 'Narrow the date range to see the calendar.' },
        },
    },
    {
        transform: [
            firstRow,
            {
                calculate:
                    "datum.source_rows >= 500 ? '500 results · more dates may exist' : 'Grey gaps: no recorded data'",
                as: 'note',
            },
        ],
        mark: { type: 'text', align: 'left', color: ink, fontSize: 10 },
        encoding: {
            x: { value: 0 },
            y: { value: { expr: 'height - 12' } },
            text: { field: 'note' },
        },
    },
];

export const buildQueryCalendarChart = (source: ChartAsCode): ChartAsCode => ({
    ...source,
    slug: 'lightdash-analytics-query-activity-query-calendar',
    name: 'Query activity calendar · daily',
    description:
        'Daily query patterns across the returned date range (UTC). The original Queries by day chart retains date zoom and drill-down. This calendar always groups by UTC day; date-range filters still apply. Grey gaps mean no recorded data. Results are limited to 500 days in ascending order.',
    metricQuery: {
        ...source.metricQuery,
        dimensions: [day],
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
