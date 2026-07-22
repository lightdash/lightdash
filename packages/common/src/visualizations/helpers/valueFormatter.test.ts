import {
    DimensionType,
    FieldType,
    type CompiledDimension,
    type ItemsMap,
} from '../../types/field';
import { getFormattedValue } from './valueFormatter';

const dimension = (name: string): CompiledDimension => ({
    name,
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    table: 'orders',
    label: name,
    tableLabel: 'orders',
    hidden: false,
    sql: `\${TABLE}.${name}`,
    compiledSql: `"orders".${name}`,
    tablesReferences: ['orders'],
});

const itemsMap: ItemsMap = {
    orders_customer_id: dimension('customer_id'),
};

const labelValueMap = {
    orders_customer_id: { '1': 'Alice', '2': 'Bob' },
};

describe('getFormattedValue with labelValueMap', () => {
    it('returns the label for a known field/value', () => {
        expect(
            getFormattedValue(
                1,
                'orders_customer_id',
                itemsMap,
                true,
                undefined,
                undefined,
                undefined,
                undefined,
                labelValueMap,
            ),
        ).toEqual('Alice');
    });

    it('falls back to formatItemValue when the value has no label', () => {
        expect(
            getFormattedValue(
                99,
                'orders_customer_id',
                itemsMap,
                true,
                undefined,
                undefined,
                undefined,
                undefined,
                labelValueMap,
            ),
        ).toEqual('99');
    });

    it('resolves the label through a pivot value column referenceField', () => {
        expect(
            getFormattedValue(
                2,
                'pivot_col',
                itemsMap,
                true,
                {
                    pivot_col: {
                        referenceField: 'orders_customer_id',
                        pivotColumnName: 'pivot_col',
                        pivotValues: [],
                    } as never,
                },
                undefined,
                undefined,
                undefined,
                labelValueMap,
            ),
        ).toEqual('Bob');
    });

    it('formats normally when no labelValueMap is provided', () => {
        expect(getFormattedValue(1, 'orders_customer_id', itemsMap)).toEqual(
            '1',
        );
    });
});
