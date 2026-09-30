import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    XAxisSortType,
    type ItemsMap,
    type RawResultRow,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { renderChart } from '../render';
import { toResultRows } from '../results';

const itemsMap: ItemsMap = {
    orders_bucket: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'bucket',
        label: 'Bucket',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.bucket',
        hidden: false,
    },
    orders_web: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'web',
        label: 'Web',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.web',
        hidden: false,
    },
    orders_store: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'store',
        label: 'Store',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.store',
        hidden: false,
    },
};

const categoryAxisData = (rawRows: RawResultRow[]) => {
    const rendered = renderChart(
        {
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_bucket',
                        yField: ['orders_web', 'orders_store'],
                        stack: true,
                    },
                    eChartsConfig: {
                        xAxis: [{ sortType: XAxisSortType.BAR_TOTALS }],
                    },
                },
            },
        },
        {
            rows: toResultRows(rawRows, itemsMap),
            fields: itemsMap,
            query: {
                dimensions: ['orders_bucket'],
                metrics: ['orders_web', 'orders_store'],
            },
        },
        { colors: { palette: ['#111111', '#222222'] } },
    );
    if (rendered.kind !== 'echarts') throw new Error(rendered.kind);
    const xAxis = rendered.option.xAxis as { data?: unknown[] }[];
    return xAxis[0].data;
};

describe('bar totals sort', () => {
    test('orders string categories by their stack total', () => {
        expect(
            categoryAxisData([
                { orders_bucket: 'a', orders_web: 5, orders_store: 5 },
                { orders_bucket: 'b', orders_web: 1, orders_store: 1 },
                { orders_bucket: 'c', orders_web: 3, orders_store: 3 },
            ]),
        ).toEqual(['b', 'c', 'a']);
    });

    // As on main: numeric categories never matched their totals, so they
    // keep the query's order. Sorting them is a separate fix.
    test('keeps numeric categories in query order, as on main', () => {
        expect(
            categoryAxisData([
                { orders_bucket: 1, orders_web: 5, orders_store: 5 },
                { orders_bucket: 2, orders_web: 1, orders_store: 1 },
                { orders_bucket: 3, orders_web: 3, orders_store: 3 },
            ]),
        ).toEqual([1, 2, 3]);
    });
});
