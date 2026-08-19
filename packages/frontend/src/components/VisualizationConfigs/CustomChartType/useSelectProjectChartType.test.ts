import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    type DataAppViz,
    type ItemsMap,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectProjectChartType } from './useSelectProjectChartType';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock('../../../features/explorer/store', () => ({
    useExplorerDispatch: () => dispatch,
    explorerActions: {
        setChartType: (payload: unknown) => ({ type: 'setChartType', payload }),
        setChartConfig: (payload: unknown) => ({
            type: 'setChartConfig',
            payload,
        }),
        setPivotConfig: (payload: unknown) => ({
            type: 'setPivotConfig',
            payload,
        }),
    },
}));

const itemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.status',
        hidden: false,
    },
    orders_region: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'region',
        label: 'Region',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.region',
        hidden: false,
    },
    orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.id',
        hidden: false,
    },
} satisfies ItemsMap;

const dataAppViz = {
    dataAppVizUuid: 'viz-uuid',
    name: 'Grouped bars',
    description: 'Groups a metric by a series dimension',
    projectUuid: 'project-uuid',
    spaceUuid: null,
    schema: {
        fields: [
            {
                name: 'category',
                label: 'Category',
                type: 'dimension',
                required: true,
            },
            {
                name: 'value',
                label: 'Value',
                type: 'metric',
                required: true,
            },
            {
                name: 'series',
                label: 'Series',
                type: 'series',
                required: true,
            },
        ],
        configOptions: [],
        colorPalette: null,
    },
    createdAt: new Date('2026-08-19T00:00:00Z'),
    createdByUserUuid: 'user-uuid',
} satisfies DataAppViz;

describe('useSelectProjectChartType', () => {
    beforeEach(() => dispatch.mockClear());

    it('stores mapped series fields in the chart pivot config', () => {
        const { result } = renderHook(() => useSelectProjectChartType());

        act(() => result.current(dataAppViz, itemsMap));

        expect(dispatch).toHaveBeenLastCalledWith({
            type: 'setPivotConfig',
            payload: { columns: ['orders_region'] },
        });
        expect(dispatch.mock.calls[1][0]).toEqual({
            type: 'setChartConfig',
            payload: {
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: 'viz-uuid',
                        fieldMapping: {
                            category: 'orders_status',
                            value: 'orders_count',
                            series: 'orders_region',
                        },
                        optionValues: {},
                    },
                },
            },
        });
    });
});
