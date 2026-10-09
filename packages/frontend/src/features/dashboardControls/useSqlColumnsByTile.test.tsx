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

    const all = { 'sql-1': [country, total], 'sql-2': [city] };

    it('maps the SQL chart tiles to every column they have, as the shipped popover does', () => {
        expect(
            columnsFor({ fieldId: 'orders_status', tableName: 'orders' }),
        ).toEqual(all);
    });

    it('does not narrow them to the type of a SQL column filter', () => {
        expect(
            columnsFor({
                fieldId: 'total',
                tableName: 'sql_chart',
                isSqlColumn: true,
                fallbackType: DimensionType.NUMBER,
            }),
        ).toEqual(all);
    });

    it('maps them for a metric filter and for a field that is gone', () => {
        expect(
            columnsFor({ fieldId: 'orders_revenue', tableName: 'orders' }),
        ).toEqual(all);
        expect(
            columnsFor({ fieldId: 'orders_gone', tableName: 'orders' }),
        ).toEqual(all);
    });

    it('leaves out columns with no usable name', () => {
        mockTileStatus.current = {
            sqlChartTilesMetadata: {
                'sql-1': { columns: [country, { type: DimensionType.STRING }] },
            },
        };
        expect(
            columnsFor({ fieldId: 'orders_status', tableName: 'orders' }),
        ).toEqual({ 'sql-1': [country], 'sql-2': [] });
    });

    it('maps nothing for a placeholder or when no control is edited', () => {
        expect(columnsFor({ fieldId: '', tableName: '' })).toEqual({});
        expect(columnsFor(null)).toEqual({});
    });
});
