import { DimensionType, friendlyName, type ResultRow } from '@lightdash/common';
import { getPivotedResults } from './getPivotedResults';

export type SqlColumn = {
    id: string;
    type: DimensionType;
};

// Bar chart defaults depends on available fields - not sql specific

// available fields depends on the initial results

// mapping the UX to the field ids is sql specific

// type SqlBarChartFieldSelectorProps = {
//     onChange: (field: Field) =>
//     fields: Fields;
//     onOptionsChange: (options: BarChartConfig) => void;
// };
// }
// export const SqlBarChartFieldSelector: FC<

// available x values
export type XLayoutOptions = {
    type: 'time' | 'category';
    columnId: string;
    timeGrainOptions:
        | ('day' | 'week' | 'month' | 'quarter' | 'year')[]
        | ('minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year')[];
};
export const xLayoutOptions = (columns: SqlColumn[]): XLayoutOptions[] => {
    let options: XLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.DATE:
                options.push({
                    type: 'time',
                    columnId: column.id,
                    timeGrainOptions: [
                        'day',
                        'week',
                        'month',
                        'quarter',
                        'year',
                    ],
                });
                break;
            case DimensionType.TIMESTAMP:
                options.push({
                    type: 'time',
                    columnId: column.id,
                    timeGrainOptions: [
                        'minute',
                        'hour',
                        'day',
                        'week',
                        'month',
                        'quarter',
                        'year',
                    ],
                });
                break;
            case DimensionType.STRING:
            case DimensionType.NUMBER:
            case DimensionType.BOOLEAN:
                options.push({
                    type: 'category',
                    columnId: column.id,
                    timeGrainOptions: [],
                });
                break;
        }
    }
    return options;
};

// available yValues
export type YLayoutOptions = {
    columnId: string;
    aggregationOptions: string[];
};
export const yLayoutOptions = (columns: SqlColumn[]): YLayoutOptions[] => {
    let options: YLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.NUMBER:
                options.push({
                    columnId: column.id,
                    aggregationOptions: [
                        'first',
                        'min',
                        'max',
                        'sum',
                        'average',
                        'count',
                        'count_distinct',
                    ],
                });
                break;
            case DimensionType.STRING:
            case DimensionType.BOOLEAN:
                options.push({
                    columnId: column.id,
                    aggregationOptions: ['count', 'count_distinct'],
                });
                break;
        }
    }
    return options;
};

// available series
type SeriesLayoutOptions = {
    columnId: string;
};
export const seriesLayoutOptions = (
    columns: SqlColumn[],
): SeriesLayoutOptions[] => {
    let options: SeriesLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.STRING:
            case DimensionType.BOOLEAN:
                options.push({
                    columnId: column.id,
                });
                break;
        }
    }
    return options;
};

type SqlTransformBarChartConfig = {
    layout: {
        x: {
            columnId: string;
            timeGrain: string;
            type: 'time' | 'categorical';
        };
        y: {
            columnId: string;
            aggregation: string;
            sort: string | null;
        }[];
        groupBy: {
            columnId: string | null;
        };
    };
};

type BarChartData = {
    results: Record<string, unknown>[];
    xAxisColumn: string;
    seriesColumns: string[];
};
const transform = async (
    config: SqlTransformBarChartConfig,
    rows: Record<string, unknown>[],
): Promise<BarChartData> => {
    const groupByColumns = [config.layout.x.columnId];
    const pivotsSql = config.layout.groupBy.columnId
        ? [config.layout.groupBy.columnId]
        : [];
    const valuesSql = config.layout.y.map(
        (y) => `${y.aggregation}(${y.columnId})`,
    );
    const sortsSql = [`${config.layout.x.columnId} ASC`];

    const pivotResults = await getPivotedResults({
        rows, // data
        groupByColumns, // bar x location
        valuesSql, // bar height
        pivotsSql, // bar grouping
        sortsSql,
    });
    return {
        results: pivotResults.results,
        xAxisColumn: pivotResults.indexColumns[0],
        seriesColumns: pivotResults.valueColumns,
    };
};

type BarChartStyling = {
    xAxis?: {
        label?: string;
    };
    yAxis?: {
        label?: string;
    };
    series?: Record<string, { label?: string }>;
};

const runTheWholeThing = async (
    data: ResultRow[],
    config: SqlTransformBarChartConfig,
    styling: BarChartStyling,
) => {
    // The bar chart only references these columns
    const relevantColumns = [
        config.layout.x.columnId,
        ...config.layout.y.map((yy) => yy.columnId),
        ...(config.layout.groupBy.columnId
            ? [config.layout.groupBy.columnId]
            : []),
    ];

    // Only doing this because we have the { raw, formatted } structure returned from the sql runner but should be simpler
    const rows = data.map((row) => {
        const newRow: {
            [key: string]: unknown;
        } = {};
        relevantColumns.forEach((column) => {
            newRow[column] = row[column].value.raw;
        });
        return newRow;
    });

    // Transform the SQL runner results into bar chart compatible results
    const transformedData = await transform(config, rows);

    // Now draw the bar chart with styling, labels, etc.
    return {
        title: {
            text: 'Bar chart',
        },
        tooltip: {},
        legend: {
            show: true,
            type: 'scroll',
            selected: {},
        },
        xAxis: {
            type: config.layout.x.type,
            name:
                styling.xAxis?.label || friendlyName(config.layout.x.columnId),
            nameLocation: 'center',
            nameTextStyle: {
                fontWeight: 'bold',
            },
        },
        yAxis: {
            type: 'value',
            name:
                styling.yAxis?.label ||
                friendlyName(config.layout.y[0]?.columnId),
        },
        dataset: {
            id: 'dataset',
            source: transformedData.results,
        },
        series: transformedData.seriesColumns.map((seriesColumn) => ({
            dimensions: [transformedData.xAxisColumn, seriesColumn],
            type: 'bar',
            name:
                (styling.series && styling.series[seriesColumn]?.label) ||
                friendlyName(seriesColumn),
            encode: {
                x: transformedData.xAxisColumn,
                y: seriesColumn,
            },
        })),
    };
};
