import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type ResultRow,
    type TableChart,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    ServicesContext,
    StateContext,
    type VisualizationState,
} from '../../components/LightdashVisualization/context';
import {
    buildInitialVisualizationState,
    createVisualizationStore,
} from '../../features/visualization/store';
import {
    defaultVisualizationInputs,
    visualizationTestServices,
    withVisualizationStore,
} from '../../testing/visualizationStore';
import { VisualizationStoreTestProvider } from '../../testing/VisualizationStoreTestProvider';
import { getFirstResultsPageSize } from '../resultsFirstPage';
import useTableConfig from './useTableConfig';

vi.mock('../useProjectUuid', () => ({ useProjectUuid: () => 'project' }));
vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));
vi.mock('../useAsyncCalculateTotal', () => {
    const idle = () => ({ data: undefined, error: null, isFetching: false });
    return {
        useAsyncCalculateGrandTotal: idle,
        useAsyncCalculateRowSubtotals: idle,
        useAsyncCalculateRowTotal: idle,
        useAsyncCalculateSubtotals: idle,
        useAsyncCalculateTotal: idle,
    };
});

const render = (
    config?: TableChart,
    inputs?: Parameters<typeof withVisualizationStore>[1],
) =>
    renderHook(() => useTableConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.TABLE, config },
            inputs,
        ),
    });

const ordersStatus: CompiledDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    compiledSql: '"orders".status',
    tablesReferences: ['orders'],
    hidden: false,
};

describe('useTableConfig', () => {
    it('seeds defaults from an empty config', () => {
        const { result } = render(undefined);
        expect(result.current.validConfig).toEqual({
            showColumnCalculation: false,
            showRowCalculation: false,
            showTableNames: false,
            showResultsTotal: false,
            showSubtotals: false,
            showSubtotalsExpanded: false,
            showRowGrouping: false,
            columns: {},
            hideRowNumbers: false,
            conditionalFormattings: [],
            metricsAsRows: false,
            rowLimit: undefined,
        });
    });

    it('seeds from the saved config', () => {
        const { result } = render({
            showColumnCalculation: true,
            hideRowNumbers: true,
            columns: { a: { visible: false } },
            rowLimit: { mode: 'show', direction: 'first', count: 50 },
        });
        expect(result.current.validConfig).toMatchObject({
            showColumnCalculation: true,
            hideRowNumbers: true,
            columns: { a: { visible: false } },
            rowLimit: { mode: 'show', direction: 'first', count: 50 },
        });
    });

    it('toggles flags', () => {
        const { result } = render(undefined);
        act(() => result.current.toggle('showColumnCalculation'));
        act(() => result.current.toggle('showResultsTotal'));
        expect(result.current.showColumnCalculation).toBe(true);
        expect(result.current.showResultsTotal).toBe(true);
    });

    it('composes consecutive column property updates', () => {
        const { result } = render(undefined);
        act(() => {
            result.current.updateColumnProperty('a', { visible: false });
            result.current.updateColumnProperty('a', { frozen: true });
            result.current.updateColumnProperty('b', { width: 10 });
        });
        expect(result.current.columnProperties).toEqual({
            a: { visible: false, frozen: true },
            b: { width: 10 },
        });
    });

    it('defaults show table names from the items until one is saved', () => {
        const itemsMap = { orders_status: ordersStatus };
        expect(render({}, { itemsMap }).result.current.showTableNames).toBe(
            true,
        );
        expect(
            render({ showTableNames: false }, { itemsMap }).result.current
                .validConfig.showTableNames,
        ).toBe(false);
    });
});

const ordersRevenue = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    compiledSql: 'SUM("orders".revenue)',
    tablesReferences: ['orders'],
    hidden: false,
} as CompiledMetric;

const WIDE_TABLE_COLUMN_COUNT = 2000;

const revenueRows = (count: number, max: number): ResultRow[] =>
    Array.from({ length: count }, (_, i) => {
        const raw = i === count - 1 ? max : i + 1;
        return { orders_revenue: { value: { raw, formatted: `${raw}` } } };
    });

const renderWithResults = (rows: ResultRow[]) => {
    let state: VisualizationState = {
        ...defaultVisualizationInputs,
        itemsMap: { orders_revenue: ordersRevenue },
        resultsData: {
            queryUuid: 'query-1',
            totalResults: 5000,
            rows,
            isInitialLoading: false,
            isFetchingFirstPage: false,
            isFetchingRows: false,
            isFetchingAllPages: false,
            fetchMoreRows: () => {},
            refetchRows: async () => {},
            setFetchAll: () => {},
            fetchAll: false,
            hasFetchedAllRows: false,
            totalClientFetchTimeMs: undefined,
            error: null,
        },
    };
    const store = createVisualizationStore(
        buildInitialVisualizationState(
            {
                type: ChartType.TABLE,
                config: {
                    columns: { orders_revenue: { displayStyle: 'bar' } },
                    conditionalFormattings: [
                        {
                            target: { fieldId: 'orders_revenue' },
                            color: { start: '#ffffff', end: '#000000' },
                            rule: { min: 'auto', max: 'auto' },
                        },
                    ],
                },
            },
            { itemsMap: state.itemsMap, hasConfigOwner: false },
        ),
    );
    const services = visualizationTestServices(() => state);
    const wrapper: FC<PropsWithChildren> = ({ children }) => (
        <VisualizationStoreTestProvider store={store}>
            <ServicesContext.Provider value={services}>
                <StateContext.Provider value={state}>
                    {children}
                </StateContext.Provider>
            </ServicesContext.Provider>
        </VisualizationStoreTestProvider>
    );
    const hook = renderHook(() => useTableConfig(), { wrapper });
    const setRows = (nextRows: ResultRow[]) => {
        state = {
            ...state,
            resultsData: { ...state.resultsData!, rows: nextRows },
        };
        hook.rerender();
    };
    return { ...hook, setRows };
};

describe('useTableConfig min/max with a smaller first page', () => {
    const firstPageSize = getFirstResultsPageSize(WIDE_TABLE_COLUMN_COUNT);

    it('recomputes the range when the 500-row page replaces the small first page', () => {
        expect(firstPageSize).toBeLessThan(500);
        const { result, setRows } = renderWithResults(
            revenueRows(firstPageSize, 100),
        );
        expect(result.current.minMaxMap).toEqual({
            orders_revenue: { min: 1, max: 100 },
        });

        setRows(revenueRows(500, 9000));

        expect(result.current.minMaxMap).toEqual({
            orders_revenue: { min: 1, max: 9000 },
        });
    });

    it('keeps the cached range across re-renders and later scroll pages, as on main', () => {
        const { result, rerender, setRows } = renderWithResults(
            revenueRows(500, 9000),
        );
        const range = result.current.minMaxMap;
        expect(range).toEqual({ orders_revenue: { min: 1, max: 9000 } });

        rerender();
        expect(result.current.minMaxMap).toBe(range);

        setRows(revenueRows(500, 9000));
        expect(result.current.minMaxMap).toBe(range);

        setRows(revenueRows(1000, 50_000));
        expect(result.current.minMaxMap).toBe(range);
    });
});
