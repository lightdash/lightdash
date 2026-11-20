import {
    DimensionType,
    FieldType,
    FilterOperator,
    QuerySourceType,
    type ComposerChartPipelineNode,
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getComposerTileFilterItems } from './composerTileFilterItems';

const semantic = (
    nodeId: string,
    title: string,
): ComposerChartPipelineNode => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId,
    title,
    exploreName: nodeId,
    dimensions: [`${nodeId}_status`],
    metrics: [],
});

const duckdb: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'summary',
    title: 'Summary',
    sql: 'select * from orders',
    references: ['orders'],
};

const sql: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'result',
    title: 'Result',
    sql: 'select 1',
};

const statusRule = (table: string): DashboardFilterRule => ({
    id: 'status-filter',
    label: undefined,
    target: { fieldId: `${table}_status`, tableName: table },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
});

const applied = (...rules: DashboardFilterRule[]): DashboardFilters => ({
    dimensions: rules,
    metrics: [],
    tableCalculations: [],
});

const statusField: FilterableDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
};

describe('getComposerTileFilterItems', () => {
    it('names no node when only one node can take filters', () => {
        const items = getComposerTileFilterItems({
            nodes: [semantic('orders', 'Orders'), duckdb],
            appliedDashboardFiltersByNodeId: {
                orders: applied(statusRule('orders')),
            },
            fields: [statusField],
            sqlColumns: [],
        });
        expect(items).toEqual([
            {
                key: 'orders:status-filter',
                filterRule: statusRule('orders'),
                field: statusField,
                sourceLabel: null,
            },
        ]);
    });

    it('names each node, in pipeline order, when several ran the filter', () => {
        const items = getComposerTileFilterItems({
            nodes: [
                semantic('orders', 'Orders'),
                semantic('payments', 'Payments'),
            ],
            appliedDashboardFiltersByNodeId: {
                payments: applied(statusRule('payments')),
                orders: applied(statusRule('orders')),
            },
            fields: [statusField],
            sqlColumns: [],
        });
        expect(
            items.map(({ key, sourceLabel, field }) => [
                key,
                sourceLabel,
                field,
            ]),
        ).toEqual([
            ['orders:status-filter', 'Orders', statusField],
            // The tile's filterable fields have no payments_status
            ['payments:status-filter', 'Payments', null],
        ]);
    });

    it('labels a SQL column filter from the column the run reported', () => {
        const sqlRule: DashboardFilterRule = {
            ...statusRule('orders'),
            target: { fieldId: 'status', tableName: '', isSqlColumn: true },
        };
        const items = getComposerTileFilterItems({
            nodes: [semantic('orders', 'Orders'), sql],
            appliedDashboardFiltersByNodeId: {
                orders: applied(statusRule('orders')),
                result: applied(sqlRule),
            },
            fields: [statusField],
            sqlColumns: [{ reference: 'status', type: DimensionType.STRING }],
        });
        expect(
            items.map(({ key, sourceLabel, field }) => [
                key,
                sourceLabel,
                field,
            ]),
        ).toEqual([
            ['orders:status-filter', 'Orders', statusField],
            [
                'result:status-filter',
                'Result',
                expect.objectContaining({ name: 'status', label: 'status' }),
            ],
        ]);
    });
});
