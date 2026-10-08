import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector(mockTileStatus.current)),
}));

const field = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
};
const revenue = {
    ...field,
    fieldType: FieldType.METRIC,
    type: MetricType.NUMBER,
    name: 'revenue',
    label: 'Revenue',
};

const tile = (uuid: string, type: DashboardTileTypes) =>
    ({ uuid, type }) as DashboardTile;

const rule = (target: DashboardFilterRule['target']): DashboardFilterRule => ({
    id: 'filter-1',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target,
    values: [],
});

const country = { reference: 'country', type: DimensionType.STRING };
const total = { reference: 'total', type: DimensionType.NUMBER };
const city = { reference: 'city', type: DimensionType.STRING };

describe('useSqlColumnsByTile', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            dashboardTiles: [
                tile('chart', DashboardTileTypes.SAVED_CHART),
                tile('sql-1', DashboardTileTypes.SQL_CHART),
                tile('sql-2', DashboardTileTypes.SQL_CHART),
            ],
            allFilterableFieldsMap: { orders_status: field },
            allFilterableMetricsMap: { orders_revenue: revenue },
            filterableFieldsByTileUuid: { chart: [field, revenue] },
        };
        mockTileStatus.current = {
            sqlChartTilesMetadata: {
                'sql-1': { columns: [country, total] },
                'sql-2': { columns: [city] },
            },
        };
    });

    const columnsFor = (target: DashboardFilterRule['target'] | null) =>
        renderHook(() =>
            useSqlColumnsByTile(target === null ? null : rule(target)),
        ).result.current;

    it("maps the SQL chart tiles to their columns of a dimension filter's kind", () => {
        expect(
            columnsFor({ fieldId: 'orders_status', tableName: 'orders' }),
        ).toEqual({ 'sql-1': [country], 'sql-2': [city] });
    });

    it("maps them to the columns of a SQL column filter's type", () => {
        expect(
            columnsFor({
                fieldId: 'country',
                tableName: 'sql_chart',
                isSqlColumn: true,
                fallbackType: DimensionType.STRING,
            }),
        ).toEqual({ 'sql-1': [country], 'sql-2': [city] });
        expect(
            columnsFor({
                fieldId: 'total',
                tableName: 'sql_chart',
                isSqlColumn: true,
                fallbackType: DimensionType.NUMBER,
            }),
        ).toEqual({ 'sql-1': [total], 'sql-2': [] });
    });

    it('uses the type the target carries when no tile reports the column', () => {
        expect(
            columnsFor({
                fieldId: 'gone',
                tableName: 'sql_chart',
                isSqlColumn: true,
                fallbackType: DimensionType.NUMBER,
            }),
        ).toEqual({ 'sql-1': [total], 'sql-2': [] });
    });

    it('maps nothing for a metric filter, a placeholder or a field that is gone', () => {
        expect(
            columnsFor({ fieldId: 'orders_revenue', tableName: 'orders' }),
        ).toEqual({});
        expect(columnsFor({ fieldId: '', tableName: '' })).toEqual({});
        expect(
            columnsFor({ fieldId: 'orders_gone', tableName: 'orders' }),
        ).toEqual({});
        expect(columnsFor(null)).toEqual({});
    });
});
