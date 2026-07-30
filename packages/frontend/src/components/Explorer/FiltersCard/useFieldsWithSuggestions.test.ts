import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type Explore,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { useFieldsWithSuggestions } from './useFieldsWithSuggestions';

const makeDimension = (name: string, hidden: boolean): CompiledDimension => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden,
});

const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: '',
            schema: '',
            sqlTable: 'orders',
            dimensions: {
                status: makeDimension('status', false),
                order_notes: makeDimension('order_notes', true),
            },
            metrics: {},
            lineageGraph: {},
        },
    },
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

const renderFieldsWithSuggestions = (includeHiddenFields: boolean) =>
    renderHook(() =>
        useFieldsWithSuggestions({
            exploreData: explore,
            rows: undefined,
            customDimensions: undefined,
            additionalMetrics: undefined,
            tableCalculations: undefined,
            includeHiddenFields,
        }),
    );

describe('useFieldsWithSuggestions', () => {
    it('excludes hidden fields by default', () => {
        const { result } = renderFieldsWithSuggestions(false);

        expect(Object.keys(result.current)).toEqual(['orders_status']);
    });

    it('includes hidden fields when requested', () => {
        const { result } = renderFieldsWithSuggestions(true);

        expect(Object.keys(result.current).sort()).toEqual([
            'orders_order_notes',
            'orders_status',
        ]);
    });
});
