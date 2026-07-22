import {
    DimensionType,
    FieldType,
    type CompiledDimension,
} from '../../types/field';
import { getCartesianAxisFormatterConfig } from './getCartesianAxisFormatterConfig';

const dimension = (name: string, type: DimensionType): CompiledDimension => ({
    name,
    fieldType: FieldType.DIMENSION,
    type,
    table: 'orders',
    label: name,
    tableLabel: 'orders',
    hidden: false,
    sql: `\${TABLE}.${name}`,
    compiledSql: `"orders".${name}`,
    tablesReferences: ['orders'],
});

const labelValueMap = {
    orders_customer_id: { '1': 'Alice' },
};

describe('getCartesianAxisFormatterConfig with labelValueMap', () => {
    it('labels a categorical axis and falls back for unmapped values', () => {
        const config = getCartesianAxisFormatterConfig({
            axisItem: dimension('customer_id', DimensionType.STRING),
            show: true,
            labelValueMap,
        });
        const { formatter } = config.axisLabel as { formatter: AnyFormatter };
        expect(formatter(1)).toEqual('Alice');
        expect(formatter(99)).toEqual('99');
    });

    it('does not label a timestamp axis (keeps native formatting)', () => {
        const config = getCartesianAxisFormatterConfig({
            axisItem: dimension('created_at', DimensionType.TIMESTAMP),
            show: true,
            labelValueMap: { orders_created_at: { '1': 'Alice' } },
        });
        const axisLabel = config.axisLabel as
            | { formatter?: AnyFormatter }
            | undefined;
        expect(axisLabel?.formatter).toBeUndefined();
    });
});

type AnyFormatter = (value: unknown) => string;
